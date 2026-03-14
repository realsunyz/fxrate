FROM node:alpine
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && npm install -g pm2 && pnpm install --prod --frozen-lockfile

WORKDIR /app

COPY pm2.json ./
COPY dist ./dist

CMD [ "pm2-runtime", "start", "pm2.json" ]
