# DoChain Oracle Feeder

This contains the Oracle feeder software used for periodically submitting oracle votes for the exchange rate of assets supported by DoChain.

Every validator must participate in the oracle process and periodically submit vote and prevote messages. Because this process occurs regularly, validators must set up an automated feeder process to avoid oracle misses, slashing, or jailing.

## Overview

This solution has 2 components:

1. [`price-server`](price-server/)

   - Obtains information from data sources
   - Models the data
   - Exposes a URL to query the latest price data

2. [`feeder`](feeder/)

   - Reads exchange rate data from the `price-server`
   - Periodically submits vote and prevote messages following the oracle voting procedure

## Requirements

1. DoChain validator node setup
2. Public / private network
3. Instance for blockchain node used for broadcasting transactions
4. Instance for running the price server
5. Instance for running the feeder in the private network with access to the validator node

## Using `docker-compose`

1. Install Docker

   - [Docker Install documentation](https://docs.docker.com/install/)
   - [Docker Compose Install documentation](https://docs.docker.com/compose/install/)

2. Review `docker-compose.yml` and change the feeder environment variables.

Required variables:

```txt
ORACLE_FEEDER_PASSWORD=<strong unique password>
ORACLE_FEEDER_MNEMONIC=<24 word feeder mnemonic>
ORACLE_FEEDER_VALIDATORS=dovaloper1...
ORACLE_FEEDER_COIN_TYPE=888
ORACLE_FEEDER_GAS_PRICE=0
