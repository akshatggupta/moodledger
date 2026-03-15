#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}MOODLEDGER — DEPLOY${NC}"
echo ""

echo -e "${YELLOW}[1/5] Setting up identity...${NC}"
stellar keys generate --global deployer --network testnet 2>/dev/null || true
stellar keys fund deployer --network testnet
DEPLOYER=$(stellar keys address deployer)
echo -e "${GREEN}✓ Deployer: ${DEPLOYER}${NC}"

echo -e "${YELLOW}[2/5] Building WASM...${NC}"
cd contract
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/moodledger.wasm"
cd ..

echo -e "${YELLOW}[3/5] Uploading WASM...${NC}"
WASM_HASH=$(stellar contract upload \
  --network testnet --source deployer \
  --wasm contract/${WASM})
echo -e "${GREEN}✓ Hash: ${WASM_HASH}${NC}"

echo -e "${YELLOW}[4/5] Deploying contract...${NC}"
CONTRACT_ID=$(stellar contract deploy \
  --network testnet --source deployer \
  --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ CONTRACT_ID: ${CONTRACT_ID}${NC}"

# Today as days since epoch
TODAY_DAY=$(( $(date +%s) / 86400 ))

echo -e "${YELLOW}[5/5] Logging proof mood entry (day ${TODAY_DAY})...${NC}"
TX_RESULT=$(stellar contract invoke \
  --network testnet --source deployer \
  --id ${CONTRACT_ID} \
  -- log_mood \
  --author ${DEPLOYER} \
  --mood 4 \
  --note '"Deployed MoodLedger to Stellar testnet. Feeling good."' \
  --day ${TODAY_DAY} 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)
echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${CYAN}CONTRACT : ${CONTRACT_ID}${NC}"
echo -e "${CYAN}PROOF TX : ${TX_HASH}${NC}"
echo -e "${CYAN}EXPLORER : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}${NC}"
echo ""
echo "Next: cd frontend && npm install && npm run dev"
