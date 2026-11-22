FROM node:22-alpine

# Install FFmpeg and fonts required by the Product Showcase Animation Engine
RUN apk add --no-cache ffmpeg ttf-dejavu fontconfig openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
