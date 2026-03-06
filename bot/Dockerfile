FROM node:23-alpine AS base

# set our node environment, either development or production
# defaults to production, compose overrides this to development on build and run
ARG NODE_ENV=development
ENV NODE_ENV $NODE_ENV

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

FROM base as production
RUN npm ci
COPY . .
CMD ["npm", "start"]
