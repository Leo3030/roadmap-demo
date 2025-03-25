FROM node:18-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
# RUN npm remove @shopify/cli

COPY . .

RUN npm install -g @shopify/cli @shopify/app

RUN npm install

RUN npm run build

CMD ["pnpm", "run", "docker-start"]
