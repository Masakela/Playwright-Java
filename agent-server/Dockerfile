# Reference AI-agent service - zero dependencies, just Node.
FROM node:20-alpine
WORKDIR /app
COPY server.js package.json ./
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
