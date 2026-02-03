#!/bin/bash

# Test script to manually verify MCP message flow

BASE_URL="https://web-production-3ff50.up.railway.app"
AUTH_TOKEN="AatePo8J9fh/nTMCPacX+0FAIXhYnWKK3IrZdYALaqs="

echo "=== Testing MCP Server Flow ==="
echo ""

# Step 1: Establish SSE connection in background and capture session ID
echo "1. Establishing SSE connection..."
curl -N -H "Authorization: Bearer $AUTH_TOKEN" \
     "$BASE_URL/sse" > /tmp/sse_output.txt 2>&1 &
SSE_PID=$!

# Wait for connection
sleep 3

# Extract session ID from SSE output
SESSION_ID=$(grep -o '"sessionId":"[^"]*"' /tmp/sse_output.txt | head -1 | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  cat /tmp/sse_output.txt
  kill $SSE_PID 2>/dev/null
  exit 1
fi

echo "✅ Session ID: $SESSION_ID"
echo ""

# Step 2: Send initialize request
echo "2. Sending initialize request..."
curl -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": {
      \"jsonrpc\": \"2.0\",
      \"id\": 1,
      \"method\": \"initialize\",
      \"params\": {
        \"protocolVersion\": \"2024-11-05\",
        \"capabilities\": {},
        \"clientInfo\": {
          \"name\": \"test-client\",
          \"version\": \"1.0.0\"
        }
      }
    }
  }" \
  "$BASE_URL/sse/messages"

echo ""
echo ""

# Step 3: Send tools/list request
echo "3. Sending tools/list request..."
curl -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": {
      \"jsonrpc\": \"2.0\",
      \"id\": 2,
      \"method\": \"tools/list\",
      \"params\": {}
    }
  }" \
  "$BASE_URL/sse/messages"

echo ""
echo ""

# Step 4: Check SSE responses
echo "4. SSE responses received:"
sleep 2
tail -20 /tmp/sse_output.txt

# Cleanup
kill $SSE_PID 2>/dev/null
rm /tmp/sse_output.txt

echo ""
echo "=== Test Complete ==="
