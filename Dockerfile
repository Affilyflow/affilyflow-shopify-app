e:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# 👇 IMPORTANT: prisma schema must exist before any prisma generate can run
COPY prisma ./prisma

# (optional but recommended) ignore scripts so postinstall never surprises you
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy the rest of the app
COPY . .

# Now generate explicitly
RUN npx prisma generate

RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "docker-start"]