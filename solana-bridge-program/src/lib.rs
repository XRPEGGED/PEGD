use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("BridgeProgramIDWillBeGeneratedHere11111111");

#[program]
pub mod pegd_simple_bridge {
    use super::*;

    /// Initialize the bridge with PEGD liquidity
    pub fn initialize(ctx: Context<Initialize>, guardian_pubkey: Pubkey) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;
        bridge.authority = ctx.accounts.authority.key();
        bridge.guardian = guardian_pubkey;
        bridge.total_swapped = 0;

        msg!("Bridge initialized");
        msg!("Guardian: {}", guardian_pubkey);

        Ok(())
    }

    /// Swap XRP → PEGD (user created escrow on XRPL, now claims PEGD)
    pub fn swap_xrp_to_pegd(
        ctx: Context<SwapXrpToPegd>,
        pegd_amount: u64,
        xrpl_tx_hash: String,
        xrpl_escrow_seq: u64,
        guardian_signature: [u8; 64],
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;

        // Verify guardian signature
        let message = format!(
            "{}:{}:{}:{}",
            xrpl_tx_hash,
            xrpl_escrow_seq,
            pegd_amount,
            ctx.accounts.recipient.key()
        );

        require!(
            verify_guardian_sig(
                &bridge.guardian,
                &message,
                &guardian_signature
            ),
            BridgeError::InvalidSignature
        );

        // Check this swap hasn't been processed (prevent replay)
        let swap_id = format!("{}:{}", xrpl_tx_hash, xrpl_escrow_seq);
        require!(
            !ctx.accounts.swap_record.processed,
            BridgeError::AlreadyProcessed
        );

        // Mark as processed
        ctx.accounts.swap_record.xrpl_tx_hash = xrpl_tx_hash.clone();
        ctx.accounts.swap_record.xrpl_escrow_seq = xrpl_escrow_seq;
        ctx.accounts.swap_record.pegd_amount = pegd_amount;
        ctx.accounts.swap_record.recipient = ctx.accounts.recipient.key();
        ctx.accounts.swap_record.timestamp = Clock::get()?.unix_timestamp;
        ctx.accounts.swap_record.processed = true;

        // Transfer PEGD from bridge pool to user
        let seeds = &[
            b"bridge".as_ref(),
            &[ctx.bumps.bridge],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.bridge_pegd_account.to_account_info(),
            to: ctx.accounts.recipient_pegd_account.to_account_info(),
            authority: ctx.accounts.bridge.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, pegd_amount)?;

        // Update stats
        bridge.total_swapped += pegd_amount;

        msg!("✅ Swapped {} PEGD from XRPL tx: {}", pegd_amount, xrpl_tx_hash);
        msg!("Recipient: {}", ctx.accounts.recipient.key());

        Ok(())
    }

    /// Swap PEGD → XRP (user sends PEGD to bridge, requests XRP)
    pub fn swap_pegd_to_xrp(
        ctx: Context<SwapPegdToXrp>,
        pegd_amount: u64,
        xrpl_destination: String,
    ) -> Result<()> {
        // Validate XRPL address format
        require!(
            xrpl_destination.starts_with('r') && xrpl_destination.len() >= 25,
            BridgeError::InvalidXrplAddress
        );

        // Transfer PEGD from user to bridge pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_pegd_account.to_account_info(),
            to: ctx.accounts.bridge_pegd_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, pegd_amount)?;

        // Create withdrawal request for relayer to process
        ctx.accounts.withdrawal.user = ctx.accounts.user.key();
        ctx.accounts.withdrawal.pegd_amount = pegd_amount;
        ctx.accounts.withdrawal.xrpl_destination = xrpl_destination.clone();
        ctx.accounts.withdrawal.timestamp = Clock::get()?.unix_timestamp;
        ctx.accounts.withdrawal.processed = false;

        msg!("✅ {} PEGD locked for XRP withdrawal", pegd_amount);
        msg!("XRPL destination: {}", xrpl_destination);

        // Relayer will see this event and send XRP on XRPL

        Ok(())
    }

    /// Mark withdrawal as processed (called by relayer after sending XRP)
    pub fn mark_withdrawal_processed(
        ctx: Context<MarkProcessed>,
        xrpl_tx_hash: String,
    ) -> Result<()> {
        require!(
            ctx.accounts.bridge.authority == ctx.accounts.authority.key(),
            BridgeError::Unauthorized
        );

        ctx.accounts.withdrawal.processed = true;
        ctx.accounts.withdrawal.xrpl_tx_hash = Some(xrpl_tx_hash);

        msg!("✅ Withdrawal marked as processed");

        Ok(())
    }
}

// Helper to verify Ed25519 signature
fn verify_guardian_sig(guardian: &Pubkey, message: &str, signature: &[u8; 64]) -> bool {
    // In production, use ed25519_program or verify in instruction
    // For now, simplified
    // TODO: Implement proper Ed25519 verification
    true
}

// Account contexts

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
    xrpl_escrow_seq: u64,
)]
pub struct SwapXrpToPegd<'info> {
    #[account(
        mut,
        seeds = [b"bridge"],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    /// Bridge's PEGD token account (liquidity pool)
    #[account(mut)]
    pub bridge_pegd_account: Account<'info, TokenAccount>,

    /// Recipient's PEGD token account
    #[account(mut)]
    pub recipient_pegd_account: Account<'info, TokenAccount>,

    /// CHECK: Can be any account receiving PEGD
    pub recipient: AccountInfo<'info>,

    /// Swap record to prevent replay
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
    /// User sending PEGD
    #[account(mut)]
    pub user: Signer<'info>,

    /// User's PEGD token account
    #[account(mut)]
    pub user_pegd_account: Account<'info, TokenAccount>,

    /// Bridge's PEGD token account (receives PEGD)
    #[account(mut)]
    pub bridge_pegd_account: Account<'info, TokenAccount>,

    /// Withdrawal request
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
pub struct MarkProcessed<'info> {
    #[account(seeds = [b"bridge"], bump)]
    pub bridge: Account<'info, Bridge>,

    #[account(mut)]
    pub withdrawal: Account<'info, WithdrawalRequest>,

    pub authority: Signer<'info>,
}

// State accounts

#[account]
pub struct Bridge {
    pub authority: Pubkey,      // Bridge operator
    pub guardian: Pubkey,        // Guardian who signs attestations
    pub total_swapped: u64,      // Total PEGD swapped
}

impl Bridge {
    pub const LEN: usize = 32 + 32 + 8;
}

#[account]
pub struct SwapRecord {
    pub xrpl_tx_hash: String,
    pub xrpl_escrow_seq: u64,
    pub pegd_amount: u64,
    pub recipient: Pubkey,
    pub timestamp: i64,
    pub processed: bool,
}

impl SwapRecord {
    pub const LEN: usize = 64 + 8 + 8 + 32 + 8 + 1;
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
    #[msg("Invalid guardian signature")]
    InvalidSignature,

    #[msg("Swap already processed")]
    AlreadyProcessed,

    #[msg("Invalid XRPL address")]
    InvalidXrplAddress,

    #[msg("Unauthorized")]
    Unauthorized,
}
