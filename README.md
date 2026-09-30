# Moffin 2 Server

A Node.js & Express server connected to MongoDB, configured with CORS and dotenv.

## Project Structure

```
Moffin_2/
├── src/
│   ├── config/
│   │   └── db.js         # MongoDB connection setup
│   └── server.js         # Express app and server entrypoint
├── .env                  # Environment configuration
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
└── package.json          # Project metadata and dependencies
```

## Setup & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Ensure `.env` has your MongoDB connection URI and desired port:
   ```env
   PORT=5000
   MONGO_URI=mongodb://127.0.0.1:27017/moffin_db
   ```

3. **Start the server:**
   - **Development mode (with auto-reload):**
     ```bash
     npm run dev
     ```
   - **Production mode:**
     ```bash
     npm start
     ```

## API Endpoints

- `GET /` - Base greeting & server status
- `GET /api/health` - Health check & MongoDB connection status
