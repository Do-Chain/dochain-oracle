FROM node:18-alpine

WORKDIR /app

COPY package*.json gate-api* ./

RUN npm ci --omit=dev --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY ./config/default-sample.js ./config/default.js

ENTRYPOINT [ "npm", "run" ]
CMD [ "start" ]
