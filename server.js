import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import 'dotenv/config';


const app = express();
const port = process.env.PORT;

// Whisper FastAPI server configuration
const WHISPER_SERVER_URL = process.env.WHSIPER_SERVER;

console.log('🚀 ===== EXPRESS SERVER STARTING =====');
console.log(`📅 Timestamp: ${new Date().toISOString()}`);
console.log(`🌐 Express server will run on: http://localhost:${port}`);
console.log(`🎤 Whisper server expected at: ${WHISPER_SERVER_URL}`);

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    console.log(`📁 [Multer] Checking upload directory: ${uploadDir}`);
    
    if (!fs.existsSync(uploadDir)) {
      console.log(`📁 [Multer] Creating upload directory: ${uploadDir}`);
      fs.mkdirSync(uploadDir);
    }
    
    console.log(`✅ [Multer] Upload directory ready: ${uploadDir}`);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const filename = `voice-${timestamp}.webm`;
    console.log(`📁 [Multer] Generated filename: ${filename}`);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    console.log('📁 [Multer] File filter - Received file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname
    });
    
    // Accept audio files
    if (file.mimetype.startsWith('audio/') || 
        file.mimetype === 'application/octet-stream' ||
        file.originalname.endsWith('.wav') ||
        file.originalname.endsWith('.webm')) {
      console.log('✅ [Multer] File accepted');
      cb(null, true);
    } else {
      console.error('❌ [Multer] File rejected - invalid type:', file.mimetype);
      cb(new Error('Only audio files are allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`\n📨 [Express] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  console.log(`📨 [Express] Headers:`, {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
  });
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📨 [Express] Body keys:`, Object.keys(req.body));
  }
  
  next();
});

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  host: 'localhost',
  port: process.env.DATABASE_PORT,
});

// Test database connection
console.log('🗄️ [Database] Attempting PostgreSQL connection...');
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ [Database] Error connecting to PostgreSQL:', err);
  } else {
    console.log('✅ [Database] Connected to PostgreSQL successfully');
    release();
  }
});

// Test Whisper server connection on startup
async function testWhisperConnection() {
  try {
    console.log('🔍 [Whisper Check] Testing Whisper server connection...');
    console.log(`🔍 [Whisper Check] Attempting to reach: ${WHISPER_SERVER_URL}/health`);
    
    const response = await fetch(`${WHISPER_SERVER_URL}/health`, {
      method: 'GET',
      timeout: 5000 // 5 second timeout
    });
    
    console.log(`🔍 [Whisper Check] Response status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`🔍 [Whisper Check] Response data:`, data);
    
    if (data.status === 'healthy' && data.model_loaded) {
      console.log('✅ [Whisper Check] Whisper server is ready and model is loaded');
    } else {
      console.log('⚠️ [Whisper Check] Whisper server responded but model may not be loaded:', data);
    }
  } catch (error) {
    console.error('❌ [Whisper Check] Could not connect to Whisper server:', error.message);
    console.log('💡 [Whisper Check] Make sure to start the Whisper server: python whisper_server.py');
    console.log('💡 [Whisper Check] Check if port 8001 is available and server is running');
  }
}

// Test connection after a short delay
setTimeout(testWhisperConnection, 3000);

// Root endpoint
app.get('/', (req, res) => {
  console.log('🏠 [Express] Root endpoint accessed');
  res.json({ 
    detail: 'Automa Voice Command Server',
    whisper_server: `${WHISPER_SERVER_URL}`,
    version: '2.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint for the extension
app.get('/health', async (req, res) => {
  console.log('🏥 [Express] Health check endpoint accessed');
  
  let whisperStatus = 'unknown';
  try {
    const whisperResponse = await fetch(`${WHISPER_SERVER_URL}/health`, { timeout: 2000 });
    const whisperData = await whisperResponse.json();
    whisperStatus = whisperData.status === 'healthy' && whisperData.model_loaded ? 'ready' : 'not_ready';
  } catch (error) {
    console.log('⚠️ [Express] Whisper server not reachable during health check');
    whisperStatus = 'unreachable';
  }
  
  const healthData = {
    express_status: 'healthy',
    whisper_status: whisperStatus,
    database_status: 'connected', // We assume it's connected if we got this far
    timestamp: new Date().toISOString()
  };
  
  console.log('🏥 [Express] Health check result:', healthData);
  res.json(healthData);
});

// Voice command endpoint with comprehensive logging
app.post('/voice-command', upload.single('audio'), async (req, res) => {
  const requestId = `req-${Date.now()}`;
  const startTime = Date.now();
  
  console.log(`\n🎙️ ===== VOICE COMMAND REQUEST START [${requestId}] =====`);
  console.log(`🕒 [${requestId}] Timestamp: ${new Date().toISOString()}`);
  
  // Log request details
  console.log(`📨 [${requestId}] Request body keys:`, Object.keys(req.body));
  console.log(`📨 [${requestId}] User ID from body:`, req.body.user_id);
  console.log(`📨 [${requestId}] File upload status:`, req.file ? 'RECEIVED' : 'MISSING');
  
  const { user_id } = req.body;
  const audioFile = req.file;
  
  if (!audioFile) {
    console.error(`❌ [${requestId}] No audio file provided in request`);
    console.log(`❌ [${requestId}] Request files:`, req.files);
    console.log(`❌ [${requestId}] Request file:`, req.file);
    
    return res.status(400).json({
      success: false,
      error: 'No audio file provided',
      message: 'No audio file was received by server',
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  console.log(`📁 [${requestId}] Audio file details:`, {
    filename: audioFile.filename,
    originalname: audioFile.originalname,
    size: audioFile.size,
    mimetype: audioFile.mimetype,
    path: audioFile.path,
    exists: fs.existsSync(audioFile.path)
  });
  
  // Enhanced file validation
  if (audioFile.size < 1000) {
    console.error(`❌ [${requestId}] Audio file too small: ${audioFile.size} bytes`);
    
    if (fs.existsSync(audioFile.path)) {
      fs.unlinkSync(audioFile.path);
      console.log(`🗑️ [${requestId}] Small file cleaned up`);
    }
    
    return res.json({
      success: false,
      message: `Audio file too small: ${audioFile.size} bytes`,
      transcribed_text: '',
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
  
  let transcribedText = '';
  
  try {
    // Send audio to FastAPI Whisper server
    console.log(`🔊 [${requestId}] Preparing to send audio to Whisper server...`);
    console.log(`🔊 [${requestId}] Target URL: ${WHISPER_SERVER_URL}/transcribe`);
    
    const transcriptionStartTime = Date.now();
    const transcriptionResult = await sendAudioToWhisperServer(audioFile.path, requestId);
    
    const transcriptionTime = Date.now() - transcriptionStartTime;
    console.log(`✅ [${requestId}] Whisper transcription completed in ${transcriptionTime}ms`);
    console.log(`✅ [${requestId}] Transcription result:`, transcriptionResult);
    
    if (!transcriptionResult.success) {
      console.log(`❌ [${requestId}] Transcription failed:`, transcriptionResult.message);
      return res.json({
        success: false,
        message: transcriptionResult.message || 'Transcription failed',
        transcribed_text: '',
        processing_time_ms: Date.now() - startTime,
        transcription_time_ms: transcriptionTime,
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    transcribedText = transcriptionResult.transcription;
    console.log(`📝 [${requestId}] Transcribed text: "${transcribedText}"`);
    
    if (!transcribedText || transcribedText.trim() === '') {
      console.log(`⚠️ [${requestId}] Empty transcription result`);
      return res.json({
        success: false,
        message: 'No speech detected in audio',
        transcribed_text: '',
        processing_time_ms: Date.now() - startTime,
        transcription_time_ms: transcriptionTime,
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Command matching
    console.log(`🔍 [${requestId}] Starting command matching for: "${transcribedText.trim()}"`);
    const matchingStartTime = Date.now();
    
    const matchResult = await findMatchingCommand(transcribedText.trim(), user_id, requestId);
    
    const matchingTime = Date.now() - matchingStartTime;
    console.log(`🔍 [${requestId}] Command matching completed in ${matchingTime}ms`);
    console.log(`🔍 [${requestId}] Match result:`, matchResult);
    
    const totalTime = Date.now() - startTime;
    const response = {
      success: matchResult.success,
      transcribed_text: transcribedText.trim(),
      command: matchResult.command,
      parameter: matchResult.parameter,
      workflow_id: matchResult.workflow_id,
      message: matchResult.message,
      processing_time_ms: totalTime,
      transcription_time_ms: transcriptionTime,
      matching_time_ms: matchingTime,
      language: transcriptionResult.language,
      confidence: transcriptionResult.confidence,
      request_id: requestId,
      timestamp: new Date().toISOString()
    };
    
    console.log(`📤 [${requestId}] Sending final response:`, response);
    res.json(response);
    
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] ERROR processing voice command after ${errorTime}ms:`);
    console.error(`❌ [${requestId}] Error name: ${error.name}`);
    console.error(`❌ [${requestId}] Error message: ${error.message}`);
    console.error(`❌ [${requestId}] Error stack:`, error.stack);
    
    const errorResponse = {
      success: false,
      error: 'Voice processing failed',
      message: `Processing failed: ${error.message}`,
      details: error.stack,
      transcribed_text: transcribedText || '',
      processing_time_ms: errorTime,
      request_id: requestId,
      timestamp: new Date().toISOString()
    };
    
    console.log(`📤 [${requestId}] Sending error response:`, errorResponse);
    res.status(500).json(errorResponse);
    
  } finally {
    // Clean up audio file
    if (audioFile && fs.existsSync(audioFile.path)) {
      try {
        fs.unlinkSync(audioFile.path);
        console.log(`🗑️ [${requestId}] Audio file cleaned up successfully`);
      } catch (cleanupErr) {
        console.error(`❌ [${requestId}] Error cleaning audio file:`, cleanupErr);
      }
    }
    
    console.log(`🏁 [${requestId}] ===== VOICE COMMAND REQUEST END =====\n`);
  }
});

// Function to send audio to FastAPI Whisper server
async function sendAudioToWhisperServer(audioFilePath, requestId) {
  try {
    console.log(`📡 [${requestId}] [Whisper Client] Preparing form data...`);
    
    // Verify file exists before sending
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }
    
    const fileStats = fs.statSync(audioFilePath);
    console.log(`📡 [${requestId}] [Whisper Client] File stats:`, {
      size: fileStats.size,
      path: audioFilePath,
      exists: true
    });
    
    console.log(`📡 [${requestId}] [Whisper Client] Creating form data...`);
    
    // Create form data
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath));
    
    console.log(`📡 [${requestId}] [Whisper Client] Sending POST request to ${WHISPER_SERVER_URL}/transcribe`);
    
    // Send to FastAPI server
    const response = await fetch(`${WHISPER_SERVER_URL}/transcribe`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      timeout: 30000 // 30 second timeout
    });
    
    console.log(`📡 [${requestId}] [Whisper Client] Received response - Status: ${response.status}`);
    console.log(`📡 [${requestId}] [Whisper Client] Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      console.error(`❌ [${requestId}] [Whisper Client] HTTP Error: ${response.status} ${response.statusText}`);
      
      let errorData;
      try {
        errorData = await response.json();
        console.error(`❌ [${requestId}] [Whisper Client] Error response body:`, errorData);
      } catch (parseError) {
        console.error(`❌ [${requestId}] [Whisper Client] Could not parse error response`);
        errorData = { error: 'Unknown error' };
      }
      
      throw new Error(`Whisper server error (${response.status}): ${JSON.stringify(errorData)}`);
    }
    
    console.log(`📥 [${requestId}] [Whisper Client] Parsing response JSON...`);
    const result = await response.json();
    
    console.log(`📥 [${requestId}] [Whisper Client] Received transcription result:`, {
      success: result.success,
      transcription: result.transcription,
      message: result.message,
      processing_time: result.processing_time_ms,
      language: result.language,
      confidence: result.confidence
    });
    
    return result;
    
  } catch (error) {
    console.error(`❌ [${requestId}] [Whisper Client] Error details:`);
    console.error(`❌ [${requestId}] [Whisper Client] Error name: ${error.name}`);
    console.error(`❌ [${requestId}] [Whisper Client] Error message: ${error.message}`);
    
    if (error.code) {
      console.error(`❌ [${requestId}] [Whisper Client] Error code: ${error.code}`);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error(`❌ [${requestId}] [Whisper Client] Connection refused - Whisper server is not running!`);
      console.log(`💡 [${requestId}] [Whisper Client] Start Whisper server: python whisper_server.py`);
    } else if (error.code === 'ETIMEDOUT') {
      console.error(`❌ [${requestId}] [Whisper Client] Request timed out - Whisper server too slow`);
    }
    
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

// IMPROVED: Function to clean transcribed text by removing punctuation
function cleanTranscribedText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  console.log(`🧹 [Text Cleaner] Original text: "${text}"`);
  
  // Define punctuation characters to remove
  const punctuationChars = [',', '.', '?', '!', ';', ':', '"', "'", '(', ')', '[', ']', '{', '}', '-', '_', '/', '\\'];
  
  // Convert to array for easier manipulation
  let textArray = text.split('');
  let punctuationIndexes = [];
  
  // Find all punctuation indexes (backward loop to get correct indexes)
  for (let i = textArray.length - 1; i >= 0; i--) {
    if (punctuationChars.includes(textArray[i])) {
      punctuationIndexes.push(i);
    }
  }
  
  console.log(`🧹 [Text Cleaner] Found punctuation at indexes: [${punctuationIndexes.join(', ')}]`);
  
  // Remove punctuation characters (backward loop to maintain correct indexes)
  for (let i = punctuationIndexes.length - 1; i >= 0; i--) {
    const index = punctuationIndexes[i];
    textArray.splice(index, 1);
  }
  
  // Join back to string and clean up extra spaces
  let cleanedText = textArray.join('')
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .trim();               // Remove leading/trailing whitespace
  
  console.log(`🧹 [Text Cleaner] Cleaned text: "${cleanedText}"`);
  
  return cleanedText;
}

// FIXED: Enhanced command matching function with proper case-insensitive suffix matching
async function findMatchingCommand(userInput, userId, requestId) {
  try {
    console.log(`🔍 [${requestId}] [Command Matcher] Starting command search...`);
    console.log(`🔍 [${requestId}] [Command Matcher] Original input: "${userInput}"`);
    console.log(`🔍 [${requestId}] [Command Matcher] User ID: ${userId}`);
    
    // STEP 1: Clean the user input
    const cleanedUserInput = cleanTranscribedText(userInput);
    console.log(`🔍 [${requestId}] [Command Matcher] Cleaned input: "${cleanedUserInput}"`);
    
    if (!cleanedUserInput) {
      console.log(`⚠️ [${requestId}] [Command Matcher] Empty input after cleaning`);
      return {
        success: false,
        message: 'Empty command after cleaning'
      };
    }
    
    const query = 'SELECT * FROM commands WHERE user_id = $1 ORDER BY has_parameter ASC, command_name ASC';
    const result = await pool.query(query, [userId]);
    
    console.log(`🔍 [${requestId}] [Command Matcher] Found ${result.rows.length} commands for user ${userId}`);
    
    if (result.rows.length === 0) {
      console.log(`⚠️ [${requestId}] [Command Matcher] No commands found for user`);
      return {
        success: false,
        message: 'No commands found for this user'
      };
    }
    
    // Log all commands for debugging
    console.log(`🔍 [${requestId}] [Command Matcher] Available commands:`);
    result.rows.forEach((cmd, index) => {
      console.log(`   ${index + 1}. "${cmd.command_name}" (Parameter: ${cmd.has_parameter ? cmd.parameter_name : 'none'})`);
    });
    
    // STEP 2: First, check commands without parameters (exact match with proper case handling)
    console.log(`🔍 [${requestId}] [Command Matcher] Checking exact matches...`);
    for (const command of result.rows) {
      if (!command.has_parameter) {
        // Clean the saved command name too
        const cleanedSavedCommand = cleanTranscribedText(command.command_name);
        
        console.log(`🔍 [${requestId}] [Command Matcher] Testing exact match:`);
        console.log(`     Cleaned user input: "${cleanedUserInput.toLowerCase()}"`);
        console.log(`     Cleaned saved command: "${cleanedSavedCommand.toLowerCase()}"`);
        
        // Compare both in lowercase
        if (cleanedUserInput.toLowerCase() === cleanedSavedCommand.toLowerCase()) {
          console.log(`✅ [${requestId}] [Command Matcher] EXACT MATCH: ${command.command_name}`);
          
          return {
            success: true,
            command: command.command_name,
            parameter: null,
            workflow_id: command.workflow_id,
            message: 'Ready to execute workflow'
          };
        }
      }
    }
    
    // STEP 3: Then check commands with parameters
    console.log(`🔍 [${requestId}] [Command Matcher] Checking parameterized matches...`);
    for (const command of result.rows) {
      if (command.has_parameter && command.parameter_name) {
        const savedCommand = command.command_name;
        const savedParam = command.parameter_name;
        
        console.log(`🔍 [${requestId}] [Command Matcher] Testing parameterized: "${savedCommand}" with parameter "${savedParam}"`);
        
        // Clean the saved command
        const cleanedSavedCommand = cleanTranscribedText(savedCommand);
        const cleanedSavedParam = cleanTranscribedText(savedParam);
        
        console.log(`🔍 [${requestId}] [Command Matcher] Cleaned saved command: "${cleanedSavedCommand}"`);
        console.log(`🔍 [${requestId}] [Command Matcher] Cleaned saved parameter: "${cleanedSavedParam}"`);
        
        // FIXED: Find where the parameter appears in the saved command (case insensitive)
        const savedCommandLower = cleanedSavedCommand.toLowerCase();
        const savedParamLower = cleanedSavedParam.toLowerCase();
        const paramIndex = savedCommandLower.indexOf(savedParamLower);
        
        if (paramIndex === -1) {
          console.error(`❌ [${requestId}] [Command Matcher] Parameter "${cleanedSavedParam}" not found in command "${cleanedSavedCommand}"`);
          continue;
        }
        
        // FIXED: Extract prefix and suffix using the lowercase versions for finding positions
        const prefix = cleanedSavedCommand.substring(0, paramIndex);
        const suffix = cleanedSavedCommand.substring(paramIndex + cleanedSavedParam.length);
        
        console.log(`🔍 [${requestId}] [Command Matcher] Pattern analysis:`);
        console.log(`     Original command: "${cleanedSavedCommand}"`);
        console.log(`     Parameter: "${cleanedSavedParam}"`);
        console.log(`     Prefix: "${prefix}"`);
        console.log(`     Suffix: "${suffix}"`);
        
        // FIXED: Check if user input matches this pattern (case insensitive)
        const inputLower = cleanedUserInput.toLowerCase();
        const prefixLower = prefix.toLowerCase();
        const suffixLower = suffix.toLowerCase();
        
        console.log(`🔍 [${requestId}] [Command Matcher] Pattern matching (all lowercase):`);
        console.log(`     User input: "${inputLower}"`);
        console.log(`     Prefix: "${prefixLower}"`);
        console.log(`     Suffix: "${suffixLower}"`);
        console.log(`     Starts with prefix: ${inputLower.startsWith(prefixLower)}`);
        console.log(`     Ends with suffix: ${inputLower.endsWith(suffixLower)}`);
        
        if (inputLower.startsWith(prefixLower) && inputLower.endsWith(suffixLower)) {
          // Extract the parameter value from user input (preserve original case)
          const paramValue = cleanedUserInput.substring(prefix.length, cleanedUserInput.length - suffix.length).trim();
          
          console.log(`✅ [${requestId}] [Command Matcher] PARAMETER MATCH! Extracted parameter: "${paramValue}"`);
          
          return {
            success: true,
            command: command.command_name,
            parameter: paramValue,
            workflow_id: command.workflow_id,
            message: 'Ready to execute workflow with parameter'
          };
        } else {
          // DEBUGGING: Show why it didn't match
          console.log(`❌ [${requestId}] [Command Matcher] Pattern mismatch for "${savedCommand}":`);
          if (!inputLower.startsWith(prefixLower)) {
            console.log(`     ❌ Prefix mismatch: "${inputLower}" does not start with "${prefixLower}"`);
          }
          if (!inputLower.endsWith(suffixLower)) {
            console.log(`     ❌ Suffix mismatch: "${inputLower}" does not end with "${suffixLower}"`);
          }
        }
      }
    }
    
    console.log(`❌ [${requestId}] [Command Matcher] No matching command found`);
    return {
      success: false,
      message: 'No matching command found'
    };
    
  } catch (error) {
    console.error(`❌ [${requestId}] [Command Matcher] Database error:`, error);
    throw error;
  }
}

// Save command endpoint - ENHANCED VERSION WITH BETTER LOGGING
app.post('/save-command', async (req, res) => {
  const requestId = `save-${Date.now()}`;
  const { user_id, command_name, has_parameter, parameter_name, workflow_id } = req.body;
  
  console.log(`\n💾 [${requestId}] ===== SAVE COMMAND REQUEST =====`);
  console.log(`💾 [${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`💾 [${requestId}] Request data:`, {
    user_id,
    command_name,
    has_parameter,
    parameter_name,
    workflow_id
  });
  
  // Validate required fields
  if (!user_id || !command_name || !workflow_id) {
    console.error(`❌ [${requestId}] Missing required fields`);
    console.error(`❌ [${requestId}] user_id: ${user_id}, command_name: ${command_name}, workflow_id: ${workflow_id}`);
    
    return res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'user_id, command_name, and workflow_id are required',
      request_id: requestId
    });
  }
  
  try {
    console.log(`💾 [${requestId}] Preparing database query...`);
    
    const query = `
      INSERT INTO commands (user_id, command_name, has_parameter, parameter_name, workflow_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, created_at
    `;
    
    const queryParams = [
      user_id,
      command_name,
      has_parameter || false,
      parameter_name || null,
      workflow_id
    ];
    
    console.log(`💾 [${requestId}] Executing query with params:`, queryParams);
    
    const result = await pool.query(query, queryParams);
    
    const savedCommand = result.rows[0];
    console.log(`✅ [${requestId}] Command saved successfully:`, {
      id: savedCommand.id,
      created_at: savedCommand.created_at
    });
    
    // Log command details for debugging
    console.log(`✅ [${requestId}] Command details:`);
    console.log(`     Command Name: "${command_name}"`);
    console.log(`     Has Parameter: ${has_parameter}`);
    console.log(`     Parameter Name: ${parameter_name || 'N/A'}`);
    console.log(`     Workflow ID: ${workflow_id}`);
    console.log(`     User ID: ${user_id}`);
    console.log(`     Database ID: ${savedCommand.id}`);
    
    const response = { 
      success: true, 
      message: 'Command saved successfully',
      id: savedCommand.id,
      created_at: savedCommand.created_at,
      request_id: requestId
    };
    
    console.log(`📤 [${requestId}] Sending success response:`, response);
    res.json(response);
    
  } catch (error) {
    console.error(`❌ [${requestId}] Database error saving command:`);
    console.error(`❌ [${requestId}] Error name: ${error.name}`);
    console.error(`❌ [${requestId}] Error message: ${error.message}`);
    console.error(`❌ [${requestId}] Error code: ${error.code}`);
    console.error(`❌ [${requestId}] Error stack:`, error.stack);
    
    // Check for specific database errors
    let errorMessage = 'Database insert failed';
    if (error.code === '23505') { // Unique constraint violation
      errorMessage = 'Command with this name already exists for user';
    } else if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Invalid workflow_id provided';
    }
    
    const errorResponse = {
      success: false, 
      error: errorMessage,
      details: error.message,
      request_id: requestId
    };
    
    console.log(`📤 [${requestId}] Sending error response:`, errorResponse);
    res.status(500).json(errorResponse);
  }
  
  console.log(`🏁 [${requestId}] ===== SAVE COMMAND REQUEST END =====\n`);
});

app.post('/execute-command', async (req, res) => {
  const { user_input, user_id } = req.body;
  const requestId = `text-${Date.now()}`;
  
  console.log(`\n=== [${requestId}] TEXT COMMAND ===`);
  console.log(`📝 [${requestId}] User: ${user_id}, Input: "${user_input}"`);
  
  try {
    const matchResult = await findMatchingCommand(user_input, user_id, requestId);
    console.log(`📤 [${requestId}] Text command result:`, matchResult);
    res.json(matchResult);
  } catch (error) {
    console.error(`❌ [${requestId}] Error executing text command:`, error);
    res.status(500).json({
      success: false,
      error: 'Command execution failed',
      details: error.message
    });
  }
});

app.get('/commands/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log(`📋 [Database] Fetching commands for user: ${userId}`);
  
  try {
    const query = 'SELECT * FROM commands WHERE user_id = $1 ORDER BY command_name';
    const result = await pool.query(query, [userId]);
    
    console.log(`📋 [Database] Found ${result.rows.length} commands for user ${userId}`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ [Database] Error fetching commands:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commands'
    });
  }
});

app.delete('/commands/:id', async (req, res) => {
  const commandId = req.params.id;
  console.log(`🗑️ [Database] Deleting command ID: ${commandId}`);
  
  try {
    const query = 'DELETE FROM commands WHERE id = $1';
    await pool.query(query, [commandId]);
    
    console.log(`✅ [Database] Command ${commandId} deleted successfully`);
    res.json({ success: true, message: 'Command deleted' });
  } catch (error) {
    console.error(`❌ [Database] Error deleting command ${commandId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete command'
    });
  }
});

app.listen(port, () => {
  console.log(`\n🎉 ===== EXPRESS SERVER READY =====`);
  console.log(`🚀 Express API server running at http://localhost:${port}`);
  console.log(`🎤 Using FastAPI Whisper server at ${WHISPER_SERVER_URL}`);
  console.log(`📁 Upload directory: ./uploads`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Start Whisper server: python whisper_server.py`);
  console.log(`   2. This Express server is running ✅`);
  console.log(`   3. Load your browser extension`);
  console.log(`\n📊 Available endpoints:`);
  console.log(`   GET  / - Root endpoint`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /voice-command - Voice transcription & execution`);
  console.log(`   POST /execute-command - Text command execution`);
  console.log(`   GET  /commands/:userId - List user commands`);
  console.log(`   POST /save-command - Save new command`);
  console.log(`   DELETE /commands/:id - Delete command`);
  console.log(`\n🔍 Debugging: Watch this console for detailed request logging\n`);
});