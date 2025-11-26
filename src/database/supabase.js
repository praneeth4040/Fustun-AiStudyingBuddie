// Simple Supabase client setup
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dkwafhgmhijsbdqpazzs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrd2FmaGdtaGlqc2JkcXBhenpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4OTM2OTksImV4cCI6MjA2OTQ2OTY5OX0.Pk0HgZhTgg2V_OsDyTxw9grdPqP7PAEA2uUdsyQ0ag0';

// Create and export the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Save a chat message to Supabase
 * @param {string} userId - User ID from Supabase
 * @param {string} message - User's message
 * @param {string} response - AI's response
 * @param {Array} context - Previous chat messages for context
 */
export async function saveChatMessage(userId, message, response, context = []) {
  try {
    const { data, error } = await supabase
      .from('fustonchats')
      .insert({
        user_id: userId,
        user_message: message,
        ai_response: response,
        context: context, // Store previous messages for context
      })
      .select();

    if (error) {
      console.error('Error saving chat message:', error.message);
      return { success: false, error: error.message };
    }

    console.log('Chat message saved:', data);
    return { success: true, data };
  } catch (err) {
    console.error('Exception saving chat message:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get chat history for a user (contextual history)
 * @param {string} userId - User ID from Supabase
 * @param {number} limit - Number of recent messages to fetch (default: 10)
 */
export async function getChatHistory(userId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('fustonchats')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching chat history:', error.message);
      return { success: false, error: error.message, data: [] };
    }

    // Reverse to get oldest first
    console.log('Chat history fetched:', data);
    return { success: true, data: data.reverse() };
  } catch (err) {
    console.error('Exception fetching chat history:', err);
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Delete all chat history for a user
 * @param {string} userId - User ID from Supabase
 */
export async function clearChatHistory(userId) {
  try {
    const { error } = await supabase
      .from('fustonchats')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing chat history:', error.message);
      return { success: false, error: error.message };
    }

    console.log('Chat history cleared for user:', userId);
    return { success: true };
  } catch (err) {
    console.error('Exception clearing chat history:', err);
    return { success: false, error: err.message };
  }
}
