FROM node:22-alpine3.22

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
RUN addgroup -g 1000 oracle && \
    adduser -u 1000 -G oracle -D -h /app oracle && \
    chown -R oracle:oracle /app

USER oracle

ENTRYPOINT [ "./entrypoint.sh" ]
