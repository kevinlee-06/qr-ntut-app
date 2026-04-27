#!/bin/bash

# Simple mock phone app script
# Usage: ./send_link.sh [SESSION_ID] [URL]

SESSION_ID=$1
TARGET_URL=$2

# If not provided, prompt for them
if [ -z "$SESSION_ID" ]; then
    read -p "Enter Session ID from computer: " SESSION_ID
fi

if [ -z "$TARGET_URL" ]; then
    read -p "Enter URL to send to computer: " TARGET_URL
fi

# Base URL (default to localhost for dev, or can be passed as env)
BASE_URL=${BASE_URL:-"http://localhost:8787"}

echo "Sending $TARGET_URL to session $SESSION_ID..."

curl -X POST "$BASE_URL/api/push/$SESSION_ID" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"$TARGET_URL\"}"

echo -e "\nDone!"
