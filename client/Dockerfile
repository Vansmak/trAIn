# Use official Node.js image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Build the React app
RUN npm run build

# Install a lightweight server to serve the React build
RUN npm install -g serve

# Expose port 3000
EXPOSE 3000

# Serve the built app
CMD ["serve", "-s", "build", "-l", "3000"]