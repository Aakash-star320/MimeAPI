
FROM node:lts-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8000

# Start the server
CMD ["node", "server.js"]
