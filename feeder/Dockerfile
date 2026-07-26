FROM node:22-alpine3.22

RUN apk add --no-cache curl jq

ENV ORACLE_FEEDER_CHAIN_ID=Do-Chain
ENV ORACLE_FEEDER_KEY_NAME=voter
ENV ORACLE_FEEDER_KEY_PATH=voter.json
ENV ORACLE_FEEDER_COIN_TYPE=888
ENV ORACLE_FEEDER_ADDR_PREFIX=do
ENV ORACLE_FEEDER_MIN_DATA_SOURCES=3

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
