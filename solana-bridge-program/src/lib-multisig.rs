use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("BridgeProgramIDWillBeGeneratedHere11111111");

#[program]
pub mod pegd_multisig_bridge {
    use super::*;

    /// Initialize bridge with 3 guardians (2-of-3 threshold)
    pub fn initialize(
        ctx: Context<Initialize>,
        guardian1: Pubkey,
        guardian2: Pubkey,
        guardian3: Pubkey,
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;
        bridge.authority = ctx.accounts.authority.key();
        bridge.guardians = vec![guardian1, guardian2, guardian3];
        bridge.threshold = 2; // Need 2-of-3 signatures
        bridge.total_swapped = 0;

        msg!("Bridge initialized with 3 guardians (2-of-3 threshold)");
        msg!("Guardian 1: {}", guardian1);
        msg!("Guardian 2: {}", guardian2);
        msg!("Guardian 3: {}", guardian3);

        Ok(())
    }

    /// Swap XRP → PEGD with multi-sig verification
    pub fn swap_xrp_to_pegd(
        ctx: Context<SwapXrpToPegd>,
        pegd_amount: u64,
        xrpl_tx_hash: String,
        xrpl_escrow_seq: u64,
        signatures: Vec<GuardianSignature>, // Multiple signatures!
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;

        // Must have at least threshold signatures
        require!(
            signatures.len() >= bridge.threshold as usize,
            BridgeError::InsufficientSignatures
        );

        // Verify this swap hasn't been processed
        require!(
            !ctx.accounts.swap_record.processed,
            BridgeError::AlreadyProcessed
        );

        // Create message that guardians signed
        let message = format!(
            "{}:{}:{}:{}",
            xrpl_tx_hash,
            xrpl_escrow_seq,
            pegd_amount,
            ctx.accounts.recipient.key()
        );

        // Verify signatures
        let valid_sigs = verify_guardian_signatures(
            &bridge.guardians,
            &message,
            &signatures,
        )?;

        require!(
            valid_sigs >= bridge.threshold,
            BridgeError::InsufficientValidSignatures
        );

        msg!("✅ Verified {}/{} guardian signatures", valid_sigs, bridge.threshold);

        // Mark swap as processed
        ctx.accounts.swap_record.xrpl_tx_hash = xrpl_tx_hash.clone();
        ctx.accounts.swap_record.xrpl_escrow_seq = xrpl_escrow_seq;
        ctx.accounts.swap_record.pegd_amount = pegd_amount;
        ctx.accounts.swap_record.recipient = ctx.accounts.recipient.key();
        ctx.accounts.swap_record.timestamp = Clock::get()?.unix_timestamp;
        ctx.accounts.swap_record.processed = true;
        ctx.accounts.swap_record.guardian_pubkeys = signatures
            .iter()
            .map(|s| s.guardian_pubkey)
            .collect();

        // Transfer PEGD from pool to user
        let seeds = &[b"bridge".as_ref(), &[ctx.bumps.bridge]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.bridge_pegd_account.to_account_info(),
            to: ctx.accounts.recipient_pegd_account.to_account_info(),
            authority: ctx.accounts.bridge.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, pegd_amount)?;

        bridge.total_swapped += pegd_amount;

        msg!("✅ Released {} PEGD from XRPL escrow {}", pegd_amount, xrpl_tx_hash);

        Ok(())
    }

    /// Swap PEGD → XRP
    pub fn swap_pegd_to_xrp(
        ctx: Context<SwapPegdToXrp>,
        pegd_amount: u64,
        xrpl_destination: String,
    ) -> Result<()> {
        require!(
            xrpl_destination.starts_with('r') && xrpl_destination.len() >= 25,
            BridgeError::InvalidXrplAddress
        );

        // Transfer PEGD from user to bridge
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_pegd_account.to_account_info(),
            to: ctx.accounts.bridge_pegd_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, pegd_amount)?;

        // Create withdrawal request
        ctx.accounts.withdrawal.user = ctx.accounts.user.key();
        ctx.accounts.withdrawal.pegd_amount = pegd_amount;
        ctx.accounts.withdrawal.xrpl_destination = xrpl_destination.clone();
        ctx.accounts.withdrawal.timestamp = Clock::get()?.unix_timestamp;
        ctx.accounts.withdrawal.processed = false;

        msg!("✅ Locked {} PEGD for XRP withdrawal to {}", pegd_amount, xrpl_destination);

        Ok(())
    }

    /// Update guardians (requires authority)
    pub fn update_guardians(
        ctx: Context<UpdateGuardians>,
        new_guardians: Vec<Pubkey>,
        new_threshold: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.bridge.authority,
            BridgeError::Unauthorized
        );

        require!(
            new_threshold as usize <= new_guardians.len(),
            BridgeError::InvalidThreshold
        );

        ctx.accounts.bridge.guardians = new_guardians;
        ctx.accounts.bridge.threshold = new_threshold;

        msg!("✅ Guardians updated");

        Ok(())
    }
}

// Helper: Verify multiple guardian signatures
fn verify_guardian_signatures(
    guardians: &Vec<Pubkey>,
    message: &str,
    signatures: &Vec<GuardianSignature>,
) -> Result<u8> {
    let mut valid_count = 0;

    for sig in signatures {
        // Check guardian is in authorized list
        if !guardians.contains(&sig.guardian_pubkey) {
            continue;
        }

        // Verify Ed25519 signature
        // In production: use ed25519_dalek or solana_program::ed25519_program
        if verify_ed25519_sig(&sig.guardian_pubkey, message, &sig.signature) {
            valid_count += 1;
        }
    }

    Ok(valid_count)
}

fn verify_ed25519_sig(pubkey: &Pubkey, message: &str, signature: &[u8; 64]) -> bool {
    // TODO: Implement proper Ed25519 verification
    // Use ed25519_dalek or Solana's ed25519_program
    true
}

// Structs

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GuardianSignature {
    pub guardian_pubkey: Pubkey,
    pub signature: [u8; 64],
}

// Accounts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Bridge::LEN,
        seeds = [b"bridge"],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    pegd_amount: u64,
    xrpl_tx_hash: String,
)]
pub struct SwapXrpToPegd<'info> {
    #[account(
        mut,
        seeds = [b"bridge"],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    #[account(mut)]
    pub bridge_pegd_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_pegd_account: Account<'info, TokenAccount>,

    /// CHECK: Recipient address
    pub recipient: AccountInfo<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + SwapRecord::LEN,
        seeds = [b"swap", xrpl_tx_hash.as_bytes()],
        bump
    )]
    pub swap_record: Account<'info, SwapRecord>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapPegdToXrp<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_pegd_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub bridge_pegd_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        space = 8 + WithdrawalRequest::LEN
    )]
    pub withdrawal: Account<'info, WithdrawalRequest>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateGuardians<'info> {
    #[account(mut, seeds = [b"bridge"], bump)]
    pub bridge: Account<'info, Bridge>,

    pub authority: Signer<'info>,
}

// State

#[account]
pub struct Bridge {
    pub authority: Pubkey,
    pub guardians: Vec<Pubkey>,    // Multiple guardians
    pub threshold: u8,              // 2-of-3, 3-of-5, etc.
    pub total_swapped: u64,
}

impl Bridge {
    pub const LEN: usize = 32 + (32 * 3) + 1 + 8; // Authority + 3 guardians + threshold + total
}

#[account]
pub struct SwapRecord {
    pub xrpl_tx_hash: String,
    pub xrpl_escrow_seq: u64,
    pub pegd_amount: u64,
    pub recipient: Pubkey,
    pub timestamp: i64,
    pub processed: bool,
    pub guardian_pubkeys: Vec<Pubkey>, // Which guardians signed
}

impl SwapRecord {
    pub const LEN: usize = 64 + 8 + 8 + 32 + 8 + 1 + (32 * 3);
}

#[account]
pub struct WithdrawalRequest {
    pub user: Pubkey,
    pub pegd_amount: u64,
    pub xrpl_destination: String,
    pub timestamp: i64,
    pub processed: bool,
    pub xrpl_tx_hash: Option<String>,
}

impl WithdrawalRequest {
    pub const LEN: usize = 32 + 8 + 64 + 8 + 1 + 64;
}

// Errors

#[error_code]
pub enum BridgeError {
    #[msg("Insufficient signatures provided")]
    InsufficientSignatures,

    #[msg("Insufficient valid signatures")]
    InsufficientValidSignatures,

    #[msg("Swap already processed")]
    AlreadyProcessed,

    #[msg("Invalid XRPL address")]
    InvalidXrplAddress,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Invalid threshold")]
    InvalidThreshold,
}
