# Stage 1: Build the application
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copying package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV PORT=5004

# Expose the port the app runs on
EXPOSE $PORT

# Start the application
CMD ["npm", "start"]
