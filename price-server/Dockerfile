FROM node:22-alpine3.22

WORKDIR /app

COPY package*.json gate-api* ./

RUN npm ci --omit=dev --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY ./config/default-sample.js ./config/default.js
RUN addgroup -g 1000 oracle && \
    adduser -u 1000 -G oracle -D -h /app oracle && \
    chown -R oracle:oracle /app

USER oracle

ENTRYPOINT [ "npm", "run" ]
CMD [ "start" ]
