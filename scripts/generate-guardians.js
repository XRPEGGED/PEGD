#!/usr/bin/env node

/**
 * Generate 3 Guardian Keypairs for Multi-Sig Bridge
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');

// Generate 3 guardian keypairs
console.log('🔑 Generating 3 Guardian Keypairs...\n');

const guardians = [];

for (let i = 1; i <= 3; i++) {
  // Generate Solana keypair (Ed25519)
  const keypair = Keypair.generate();

  const guardian = {
    number: i,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Array.from(keypair.secretKey),
    keypairFile: `guardian${i}.json`
  };

  guardians.push(guardian);

  // Save keypair to file
  const keysDir = path.join(__dirname, '..', '.guardian-keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  const filepath = path.join(keysDir, guardian.keypairFile);
  fs.writeFileSync(filepath, JSON.stringify(guardian.secretKey));

  console.log(`Guardian ${i}:`);
  console.log(`  Public Key:  ${guardian.publicKey}`);
  console.log(`  Secret Key:  ${filepath}`);
  console.log('');
}

// Create summary file
const summary = {
  generated: new Date().toISOString(),
  guardians: guardians.map(g => ({
    number: g.number,
    publicKey: g.publicKey,
    secretKeyFile: `.guardian-keys/${g.keypairFile}`
  })),
  threshold: '2-of-3',
  notes: [
    'Store these keys securely!',
    'Guardian 1: Deploy to your Cloudflare',
    'Guardian 2: Send to partner',
    'Guardian 3: Send to community member'
  ]
};

const summaryPath = path.join(__dirname, '..', '.guardian-keys', 'GUARDIANS.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log('✅ Guardian keypairs generated!');
console.log(`📄 Summary saved to: ${summaryPath}\n`);

console.log('⚠️  IMPORTANT:');
console.log('  - Keep these keys SECRET');
console.log('  - Back them up securely');
console.log('  - Never commit to git (.guardian-keys is in .gitignore)\n');

console.log('📋 For Solana program initialization:');
console.log(`  GUARDIAN1_PUBKEY="${guardians[0].publicKey}"`);
console.log(`  GUARDIAN2_PUBKEY="${guardians[1].publicKey}"`);
console.log(`  GUARDIAN3_PUBKEY="${guardians[2].publicKey}"`);
