#!/bin/sh

npm start add-key

# check if voter has been bound to validator
voter_addr=$(jq -r '.[0].address' voter.json)
lcd=$(echo "$ORACLE_FEEDER_LCD_ADDRESS" | awk -F"," '{print $1}')

feeder=$(curl -s "$lcd/do/oracle/v1beta1/validators/$ORACLE_FEEDER_VALIDATORS/feeder" | jq -r '.feeder_addr')

if [ "$voter_addr" != "$feeder" ]; then
    echo "WRONG FEEDER. REGISTER IT THROUGH: dochaind tx oracle set-feeder $voter_addr --from=<validator> --chain-id Do-Chain --fees 5000udo"
    exit 1
fi

npm start vote
