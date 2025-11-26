# Supabase Setup for Fustun Extension

## Installation & Bundling

### Step 1: Install Dependencies
```bash
npm install
```

This will install:
- `@supabase/supabase-js`: The Supabase client library
- `esbuild`: A fast bundler to compile Supabase into a browser-compatible format

### Step 2: Build Supabase Bundle
```bash
npm run build
```

This creates `src/database/supabase-bundled.js` which is a bundled version of Supabase that:
- ✅ Complies with Chrome Extension CSP restrictions
- ✅ Works without external CDN dependencies
- ✅ Is optimized for extension use

### Step 3: Development (Watch Mode)
If you're making changes to supabase.js:
```bash
npm run dev
```

This will automatically rebuild the bundle when you save changes.

## Files

- **src/database/supabase.js**: Source file with Supabase client setup and utility functions
- **src/database/supabase-bundled.js**: Auto-generated bundled file (do NOT edit manually)

## Usage in Your Code

In `panel.js` or any extension file:
```javascript
import { supabase, getUserChats, saveChat } from '../database/supabase-bundled.js';

// Get user chats
const chats = await getUserChats(userId);

// Save a new chat
await saveChat(userId, 'My Chat Title', messages);
```

## Available Functions

1. **supabase**: The Supabase client object
2. **getUserChats(userId)**: Fetch all chats for a user
3. **saveChat(userId, title, messages)**: Save a new chat
4. **updateChat(chatId, messages)**: Update an existing chat
5. **deleteChat(chatId)**: Delete a chat

## Database Schema

You need to create a `chats` table in Supabase with columns:
- `id` (UUID, primary key)
- `user_id` (UUID or text)
- `title` (text)
- `messages` (JSONB)
- `created_at` (timestamp)
- `updated_at` (timestamp)

