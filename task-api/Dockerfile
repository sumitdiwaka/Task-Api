# Used for Back4app Containers (or any Docker-based host) as a backup deploy path.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 3000
CMD ["node", "src/app.js"]
