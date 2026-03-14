FROM node:24-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@latest pm2 && pnpm install --prod --frozen-lockfile

COPY pm2.json ./
COPY dist ./dist

CMD [ "pm2-runtime", "start", "pm2.json" ]
