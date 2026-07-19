FROM node:18-alpine

RUN apk add --no-cache curl jq

ENV ORACLE_FEEDER_DATA_SOURCE_URL=http://localhost:8532/latest
ENV ORACLE_FEEDER_LCD_ADDRESS=http://127.0.0.1:1317
ENV ORACLE_FEEDER_CHAIN_ID=Do-Chain
ENV ORACLE_FEEDER_KEY_NAME=voter
ENV ORACLE_FEEDER_KEY_PATH=voter.json
ENV ORACLE_FEEDER_COIN_TYPE=888
ENV ORACLE_FEEDER_ADDR_PREFIX=do

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENTRYPOINT [ "./entrypoint.sh" ]
