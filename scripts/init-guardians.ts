#!/usr/bin/env node

/**
 * Initialize 3 Guardian Durable Objects with their keypairs
 */

import fs from 'fs';
import path from 'path';

async function initializeGuardians() {
  console.log('🔑 Initializing 3 Guardian Durable Objects...\n');

  const guardiansDir = path.join(__dirname, '..', '.guardian-keys');

  for (let i = 1; i <= 3; i++) {
    const keypairPath = path.join(guardiansDir, `guardian${i}.json`);
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));

    console.log(`Guardian ${i}:`);
    console.log(`  Loading keypair from ${keypairPath}`);

    // Initialize guardian via HTTP
    const response = await fetch(`https://pegd.org/api/bridge/guardian${i}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secretKey }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`  ✅ Initialized`);
      console.log(`  Public Key: ${result.publicKey}`);
    } else {
      console.log(`  ❌ Failed:`, result.error);
    }

    console.log('');
  }

  console.log('✅ All guardians initialized!\n');
  console.log('Verify status:');
  console.log('  curl https://pegd.org/api/bridge/guardian1/status');
  console.log('  curl https://pegd.org/api/bridge/guardian2/status');
  console.log('  curl https://pegd.org/api/bridge/guardian3/status');
}

initializeGuardians().catch(console.error);
