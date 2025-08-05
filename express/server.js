import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';


const app = express();
const port = process.env.PORT;

// Whisper FastAPI server configuration
const WHISPER_SERVER_URL = process.env.WHISPER_SERVER;

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

// Get or generate user ID endpoint
app.get('/get-user-id', (req, res) => {
  console.log('🆔 [Express] Get user ID endpoint accessed');
  
  // Generate a new UUID for the user
  const userId = uuidv4();
  
  console.log(`🆔 [Express] Generated new user ID: ${userId}`);
  
  const response = {
    success: true,
    user_id: userId,
    message: 'User ID generated successfully',
    timestamp: new Date().toISOString()
  };
  
  console.log(`📤 [Express] Sending user ID response:`, response);
  res.json(response);
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
  console.log(`📨  Request body keys:`, Object.keys(req.body));
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

// FIXED: Function to clean transcribed text by removing ALL punctuation and converting to lowercase
function cleanTranscribedText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  console.log(`🧹 [Text Cleaner] Original text: "${text}"`);
  
  // Define punctuation characters to remove
  const punctuationChars = [',', '.', '?', '!', ';', ':', '"', "'", '(', ')', '[', ']', '{', '}', '-', '_', '/', '\\'];
  
  let cleanedText = text;
  
  // Remove all punctuation characters
  punctuationChars.forEach(char => {
    cleanedText = cleanedText.replace(new RegExp('\\' + char, 'g'), '');
  });
  
  // Clean up extra spaces, convert to lowercase, and trim
  cleanedText = cleanedText
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .trim()                // Remove leading/trailing whitespace
    .toLowerCase();        // Convert to lowercase
  
  console.log(`🧹 [Text Cleaner] Cleaned text: "${cleanedText}"`);
  
  return cleanedText;
}

// Function to check if character is punctuation
function isPunctuation(char) {
  const punctuationChars = [',', '.', '?', '!', ';', ':', '"', "'", '(', ')', '[', ']', '{', '}', '-', '_', '/', '\\'];
  return punctuationChars.includes(char);
}

// FIXED: Enhanced fuzzy parameter extraction function
function extractParameterWithCasingAndPunctuation(originalText, extractedParameter, requestId) {
  console.log(`\n🧩 [${requestId}] ===== ENHANCED PARAMETER EXTRACTION START =====`);
  console.log(`🧩 [${requestId}] [Enhanced Extractor] Original text: "${originalText}"`);
  console.log(`🧩 [${requestId}] [Enhanced Extractor] Extracted parameter (to enhance): "${extractedParameter}"`);
  
  const og = originalText;
  const cleanedOgText = cleanTranscribedText(og);
  const raw = extractedParameter.toLowerCase();
  
  console.log(`🧩 [${requestId}] [Enhanced Extractor] Cleaned og text: "${cleanedOgText}"`);
  console.log(`🧩 [${requestId}] [Enhanced Extractor] Raw param: "${raw}"`);
  console.log(`🧩 [${requestId}] [Enhanced Extractor] Original text length: ${og.length}`);
  console.log(`🧩 [${requestId}] [Enhanced Extractor] Cleaned text length: ${cleanedOgText.length}`);
  console.log(`🧩 [${requestId}] [Enhanced Extractor] Raw param length: ${raw.length}`);
  
  if (raw.length === 0 || cleanedOgText.length === 0) {
    console.log(`❌ [${requestId}] [Enhanced Extractor] Empty input or parameter`);
    return null;
  }
  
  // STEP 1: Find where the extracted parameter appears in the cleaned text
  console.log(`\n🔍 [${requestId}] [Enhanced Extractor] ===== STEP 1: FINDING PARAMETER POSITION IN CLEANED TEXT =====`);
  
  const paramStartInCleaned = cleanedOgText.indexOf(raw);
  
  if (paramStartInCleaned === -1) {
    console.log(`❌ [${requestId}] [Enhanced Extractor] Parameter "${raw}" not found in cleaned text "${cleanedOgText}"`);
    return null;
  }
  
  const paramEndInCleaned = paramStartInCleaned + raw.length - 1;
  
  console.log(`🔍 [${requestId}] [Enhanced Extractor] Parameter found in cleaned text:`);
  console.log(`🔍 [${requestId}] [Enhanced Extractor]   Start index: ${paramStartInCleaned}`);
  console.log(`🔍 [${requestId}] [Enhanced Extractor]   End index: ${paramEndInCleaned}`);
  console.log(`🔍 [${requestId}] [Enhanced Extractor]   Substring: "${cleanedOgText.substring(paramStartInCleaned, paramEndInCleaned + 1)}"`);
  
  // STEP 2: Map cleaned positions back to original text positions
  console.log(`\n🗺️ [${requestId}] [Enhanced Extractor] ===== STEP 2: MAPPING TO ORIGINAL TEXT =====`);
  console.log(`🗺️ [${requestId}] [Enhanced Extractor] Need to map cleaned[${paramStartInCleaned}] and cleaned[${paramEndInCleaned}] to original positions`);
  console.log(`🗺️ [${requestId}] [Enhanced Extractor] Original text: "${og}"`);
  console.log(`🗺️ [${requestId}] [Enhanced Extractor] Cleaned text:  "${cleanedOgText}"`);
  
  let originalStartIndex = -1;
  let originalEndIndex = -1;
  let cleanedPos = 0;
  
  console.log(`🗺️ [${requestId}] [Enhanced Extractor] Starting character mapping...`);
  
  for (let ogIdx = 0; ogIdx < og.length; ogIdx++) {
    const char = og[ogIdx];
    const isPunct = isPunctuation(char);
    
    console.log(`🗺️ [${requestId}] [Enhanced Extractor] og[${ogIdx}]='${char}' ${isPunct ? '(PUNCT)' : '(CHAR)'} -> cleanedPos=${cleanedPos}`);
    
    // Map start position
    if (cleanedPos === paramStartInCleaned && originalStartIndex === -1) {
      originalStartIndex = ogIdx;
      console.log(`📍 [${requestId}] [Enhanced Extractor] >>> MAPPED START: cleaned[${paramStartInCleaned}] -> original[${ogIdx}] = '${char}' <<<`);
    }
    
    // Map end position
    if (cleanedPos === paramEndInCleaned && originalEndIndex === -1) {
      originalEndIndex = ogIdx;
      console.log(`📍 [${requestId}] [Enhanced Extractor] >>> MAPPED END: cleaned[${paramEndInCleaned}] -> original[${ogIdx}] = '${char}' <<<`);
    }
    
    // Only increment cleaned position if character appears in cleaned text
    if (!isPunct) {
      cleanedPos++;
      console.log(`🗺️ [${requestId}] [Enhanced Extractor]   cleanedPos incremented to ${cleanedPos}`);
    } else {
      console.log(`🗺️ [${requestId}] [Enhanced Extractor]   cleanedPos stays ${cleanedPos} (punctuation skipped)`);
    }
  }
  
  console.log(`\n🗺️ [${requestId}] [Enhanced Extractor] Mapping complete:`);
  console.log(`🗺️ [${requestId}] [Enhanced Extractor] originalStartIndex: ${originalStartIndex}`);
  console.log(`🗺️ [${requestId}] [Enhanced Extractor] originalEndIndex: ${originalEndIndex}`);
  
  if (originalStartIndex === -1 || originalEndIndex === -1) {
    console.log(`❌ [${requestId}] [Enhanced Extractor] Could not map positions to original text`);
    console.log(`❌ [${requestId}] [Enhanced Extractor] This is likely a bug in the mapping algorithm`);
    return null;
  }
  
  // Extract parameter with original punctuation and casing
  const enhancedParameter = og.substring(originalStartIndex, originalEndIndex + 1);
  
  console.log(`\n🎉 [${requestId}] [Enhanced Extractor] ===== SUCCESS! =====`);
  console.log(`🎉 [${requestId}] [Enhanced Extractor] Original text: "${originalText}"`);
  console.log(`🎉 [${requestId}] [Enhanced Extractor] Cleaned positions: start=${paramStartInCleaned}, end=${paramEndInCleaned}`);
  console.log(`🎉 [${requestId}] [Enhanced Extractor] Original positions: start=${originalStartIndex}, end=${originalEndIndex}`);
  console.log(`🎉 [${requestId}] [Enhanced Extractor] Extracted parameter: "${enhancedParameter}"`);
  console.log(`🎉 [${requestId}] [Enhanced Extractor] ===== END =====\n`);
  
  return enhancedParameter;
}

// REPLACE THE ENTIRE findMatchingCommand function in your server.js with this fixed version:

async function findMatchingCommand(userInput, userId, requestId) {
  try {
    console.log(`\n🔍 [${requestId}] ========================================`);
    console.log(`🔍 [${requestId}] [Command Matcher] STARTING COMMAND SEARCH`);
    console.log(`🔍 [${requestId}] ========================================`);
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
    console.log(`🔍 [${requestId}] [Command Matcher] Executing database query...`);
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
    console.log(`\n🔍 [${requestId}] [Command Matcher] ===== AVAILABLE COMMANDS =====`);
    result.rows.forEach((cmd, index) => {
      console.log(`🔍 [${requestId}] [Command Matcher] ${index + 1}. "${cmd.command_name}" | Parameter: ${cmd.has_parameter ? `"${cmd.parameter_name}"` : 'none'} | Workflow: ${cmd.workflow_id}`);
    });
    console.log(`🔍 [${requestId}] [Command Matcher] ========================================`);
    
    // STEP 2: First, check commands without parameters (exact match with proper case handling)
    console.log(`\n🔍 [${requestId}] [Command Matcher] ===== STEP 1: EXACT MATCHES (NO PARAMETERS) =====`);
    
    let exactMatchCount = 0;
    for (const command of result.rows) {
      if (!command.has_parameter) {
        exactMatchCount++;
        // Clean the saved command name too
        const cleanedSavedCommand = cleanTranscribedText(command.command_name);
        
        console.log(`\n🔍 [${requestId}] [Command Matcher] Testing exact match ${exactMatchCount}:`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Original saved: "${command.command_name}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Cleaned saved:  "${cleanedSavedCommand}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   User input:     "${cleanedUserInput}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Match: ${cleanedUserInput.toLowerCase() === cleanedSavedCommand.toLowerCase() ? 'YES' : 'NO'}`);
        
        // Compare both in lowercase
        if (cleanedUserInput.toLowerCase() === cleanedSavedCommand.toLowerCase()) {
          console.log(`✅ [${requestId}] [Command Matcher] >>> EXACT MATCH FOUND! <<<`);
          console.log(`✅ [${requestId}] [Command Matcher] Command: "${command.command_name}"`);
          console.log(`✅ [${requestId}] [Command Matcher] Workflow ID: ${command.workflow_id}`);
          
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
    
    console.log(`🔍 [${requestId}] [Command Matcher] No exact matches found (tested ${exactMatchCount} commands)`);
    
    // STEP 3: Then check commands with parameters
    console.log(`\n🔍 [${requestId}] [Command Matcher] ===== STEP 2: PARAMETERIZED MATCHES (WITH ENHANCED EXTRACTION) =====`);
    
    let paramMatchCount = 0;
    for (const command of result.rows) {
      if (command.has_parameter && command.parameter_name) {
        paramMatchCount++;
        const savedCommand = command.command_name;
        const savedParam = command.parameter_name;
        
        console.log(`\n🔍 [${requestId}] [Command Matcher] >>> Testing parameterized match ${paramMatchCount} <<<`);
        console.log(`🔍 [${requestId}] [Command Matcher] Original saved command: "${savedCommand}"`);
        console.log(`🔍 [${requestId}] [Command Matcher] Saved parameter name: "${savedParam}"`);
        console.log(`🔍 [${requestId}] [Command Matcher] Workflow ID: ${command.workflow_id}`);
        
        // Clean the saved command
        const cleanedSavedCommand = cleanTranscribedText(savedCommand);
        const cleanedSavedParam = cleanTranscribedText(savedParam);
        
        console.log(`🔍 [${requestId}] [Command Matcher] Cleaned saved command: "${cleanedSavedCommand}"`);
        console.log(`🔍 [${requestId}] [Command Matcher] Cleaned saved parameter: "${cleanedSavedParam}"`);
        
        // Find where the parameter appears in the saved command (case insensitive)
        const savedCommandLower = cleanedSavedCommand.toLowerCase();
        const savedParamLower = cleanedSavedParam.toLowerCase();
        const paramIndex = savedCommandLower.indexOf(savedParamLower);
        
        console.log(`🔍 [${requestId}] [Command Matcher] Parameter index in command: ${paramIndex}`);
        
        if (paramIndex === -1) {
          console.error(`❌ [${requestId}] [Command Matcher] ERROR: Parameter "${cleanedSavedParam}" not found in command "${cleanedSavedCommand}"`);
          console.error(`❌ [${requestId}] [Command Matcher] This suggests data corruption or invalid saved command`);
          continue;
        }
        
        // Extract prefix and suffix using the lowercase versions for finding positions
        const prefix = cleanedSavedCommand.substring(0, paramIndex);
        const suffix = cleanedSavedCommand.substring(paramIndex + cleanedSavedParam.length);
        
        console.log(`🔍 [${requestId}] [Command Matcher] Pattern breakdown (cleaned):`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Prefix: "${prefix}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Parameter: "${cleanedSavedParam}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Suffix: "${suffix}"`);
        
        // Check if user input matches this pattern (both already cleaned)
        console.log(`🔍 [${requestId}] [Command Matcher] Pattern matching (both cleaned):`);
        console.log(`🔍 [${requestId}] [Command Matcher]   User input: "${cleanedUserInput}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Prefix: "${prefix}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Suffix: "${suffix}"`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Starts with prefix: ${cleanedUserInput.startsWith(prefix)}`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Ends with suffix: ${cleanedUserInput.endsWith(suffix)}`);
        console.log(`🔍 [${requestId}] [Command Matcher]   Overall pattern match: ${cleanedUserInput.startsWith(prefix) && cleanedUserInput.endsWith(suffix)}`);
        
        if (cleanedUserInput.startsWith(prefix) && cleanedUserInput.endsWith(suffix)) {
          console.log(`✅ [${requestId}] [Command Matcher] >>> PATTERN MATCHES! Using enhanced extraction for casing/punctuation... <<<`);
          
          // BASIC EXTRACTION (from working version)
          const basicParamValue = cleanedUserInput.substring(prefix.length, cleanedUserInput.length - suffix.length).trim();
          console.log(`📝 [${requestId}] [Command Matcher] Basic extracted parameter: "${basicParamValue}"`);
          
          // ENHANCED EXTRACTION (preserve casing and punctuation)
          let enhancedParamValue = basicParamValue;
          
          // Only use enhanced extraction if we have a basic match
          if (basicParamValue) {
            console.log(`🔧 [${requestId}] [Command Matcher] Attempting enhanced parameter extraction...`);
            
            const enhancedParam = extractParameterWithCasingAndPunctuation(userInput, basicParamValue, requestId);
            
            if (enhancedParam) {
              enhancedParamValue = enhancedParam;
              console.log(`✅ [${requestId}] [Command Matcher] Enhanced extraction successful: "${enhancedParam}"`);
            } else {
              console.log(`⚠️ [${requestId}] [Command Matcher] Enhanced extraction failed, using basic: "${basicParamValue}"`);
            }
          }
          
          console.log(`\n🎉 [${requestId}] [Command Matcher] ========================================`);
          console.log(`🎉 [${requestId}] [Command Matcher] >>> PARAMETERIZED MATCH FOUND! <<<`);
          console.log(`🎉 [${requestId}] [Command Matcher] ========================================`);
          console.log(`🎉 [${requestId}] [Command Matcher] Original command: "${savedCommand}"`);
          console.log(`🎉 [${requestId}] [Command Matcher] Final extracted parameter: "${enhancedParamValue}"`);
          console.log(`🎉 [${requestId}] [Command Matcher] Workflow ID: ${command.workflow_id}`);
          console.log(`🎉 [${requestId}] [Command Matcher] ========================================`);
          
          return {
            success: true,
            command: command.command_name,
            parameter: enhancedParamValue,
            workflow_id: command.workflow_id,
            message: 'Ready to execute workflow with parameter'
          };
        } else {
          // DEBUGGING: Show why it didn't match - FIXED VERSION
          console.log(`❌ [${requestId}] [Command Matcher] Pattern mismatch for "${savedCommand}":`);
          if (!cleanedUserInput.startsWith(prefix)) {
            console.log(`❌ [${requestId}] [Command Matcher]   Prefix mismatch: "${cleanedUserInput}" does not start with "${prefix}"`);
          }
          if (!cleanedUserInput.endsWith(suffix)) {
            console.log(`❌ [${requestId}] [Command Matcher]   Suffix mismatch: "${cleanedUserInput}" does not end with "${suffix}"`);
          }
          console.log(`❌ [${requestId}] [Command Matcher] Skipping this command...`);
        }
      }
    }
    
    console.log(`\n❌ [${requestId}] [Command Matcher] ========================================`);
    console.log(`❌ [${requestId}] [Command Matcher] NO MATCHING COMMAND FOUND`);
    console.log(`❌ [${requestId}] [Command Matcher] ========================================`);
    console.log(`❌ [${requestId}] [Command Matcher] Tested ${exactMatchCount} exact matches`);
    console.log(`❌ [${requestId}] [Command Matcher] Tested ${paramMatchCount} parameterized matches`);
    console.log(`❌ [${requestId}] [Command Matcher] User input: "${userInput}"`);
    console.log(`❌ [${requestId}] [Command Matcher] Cleaned input: "${cleanedUserInput}"`);
    console.log(`❌ [${requestId}] [Command Matcher] Available commands:`);
    result.rows.forEach((cmd, index) => {
      console.log(`❌ [${requestId}] [Command Matcher]   ${index + 1}. "${cmd.command_name}" (${cmd.has_parameter ? 'with parameter' : 'no parameter'})`);
    });
    console.log(`❌ [${requestId}] [Command Matcher] ========================================`);
    
    return {
      success: false,
      message: 'No matching command found'
    };
    
  } catch (error) {
    console.error(`❌ [${requestId}] [Command Matcher] ========================================`);
    console.error(`❌ [${requestId}] [Command Matcher] DATABASE ERROR`);
    console.error(`❌ [${requestId}] [Command Matcher] ========================================`);
    console.error(`❌ [${requestId}] [Command Matcher] Error name: ${error.name}`);
    console.error(`❌ [${requestId}] [Command Matcher] Error message: ${error.message}`);
    console.error(`❌ [${requestId}] [Command Matcher] Error code: ${error.code}`);
    console.error(`❌ [${requestId}] [Command Matcher] Error stack:`, error.stack);
    console.error(`❌ [${requestId}] [Command Matcher] ========================================`);
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


app.delete('/commands/workflow/:workflowId', async (req, res) => {
  const workflowId = req.params.workflowId;
  const { user_id } = req.body; // User ID sent in request body
  const requestId = `delete-workflow-${Date.now()}`;
  
  console.log(`\n🗑️ [${requestId}] ===== DELETE WORKFLOW COMMANDS REQUEST =====`);
  console.log(`🗑️ [${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`🗑️ [${requestId}] Workflow ID: ${workflowId}`);
  console.log(`🗑️ [${requestId}] User ID: ${user_id}`);
  
  // Validate required parameters
  if (!workflowId) {
    console.error(`❌ [${requestId}] Missing workflow ID`);
    return res.status(400).json({
      success: false,
      error: 'Missing workflow ID',
      request_id: requestId
    });
  }
  
  if (!user_id) {
    console.error(`❌ [${requestId}] Missing user ID`);
    return res.status(400).json({
      success: false,
      error: 'Missing user ID',
      request_id: requestId
    });
  }
  
  try {
    console.log(`🗑️ [${requestId}] Searching for commands to delete...`);
    
    // First, find all commands for this workflow and user
    const findQuery = 'SELECT * FROM commands WHERE workflow_id = $1 AND user_id = $2';
    const findResult = await pool.query(findQuery, [workflowId, user_id]);
    
    const commandsToDelete = findResult.rows;
    console.log(`🗑️ [${requestId}] Found ${commandsToDelete.length} commands to delete`);
    
    if (commandsToDelete.length === 0) {
      console.log(`ℹ️ [${requestId}] No commands found for workflow ${workflowId}`);
      return res.json({
        success: true,
        message: 'No commands found for this workflow',
        deleted_count: 0,
        commands: [],
        request_id: requestId
      });
    }
    
    // Log what we're about to delete
    console.log(`🗑️ [${requestId}] Commands to delete:`);
    commandsToDelete.forEach((cmd, index) => {
      console.log(`🗑️ [${requestId}]   ${index + 1}. "${cmd.command_name}" (ID: ${cmd.id})`);
    });
    
    // Delete all commands for this workflow and user
    const deleteQuery = 'DELETE FROM commands WHERE workflow_id = $1 AND user_id = $2 RETURNING *';
    const deleteResult = await pool.query(deleteQuery, [workflowId, user_id]);
    
    const deletedCommands = deleteResult.rows;
    console.log(`✅ [${requestId}] Successfully deleted ${deletedCommands.length} commands`);
    
    // Log what was deleted
    console.log(`✅ [${requestId}] Deleted commands:`);
    deletedCommands.forEach((cmd, index) => {
      console.log(`✅ [${requestId}]   ${index + 1}. "${cmd.command_name}" (ID: ${cmd.id})`);
    });
    
    const response = {
      success: true,
      message: `Successfully deleted ${deletedCommands.length} voice commands`,
      deleted_count: deletedCommands.length,
      commands: deletedCommands.map(cmd => ({
        id: cmd.id,
        command_name: cmd.command_name,
        has_parameter: cmd.has_parameter,
        parameter_name: cmd.parameter_name
      })),
      workflow_id: workflowId,
      user_id: user_id,
      request_id: requestId,
      timestamp: new Date().toISOString()
    };
    
    console.log(`📤 [${requestId}] Sending success response:`, {
      ...response,
      commands: `[${response.deleted_count} commands]` // Don't log full command details
    });
    
    res.json(response);
    
  } catch (error) {
    console.error(`❌ [${requestId}] Database error deleting workflow commands:`);
    console.error(`❌ [${requestId}] Error name: ${error.name}`);
    console.error(`❌ [${requestId}] Error message: ${error.message}`);
    console.error(`❌ [${requestId}] Error code: ${error.code}`);
    console.error(`❌ [${requestId}] Error stack:`, error.stack);
    
    // Check for specific database errors
    let errorMessage = 'Database delete failed';
    if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Cannot delete commands - foreign key constraint';
    } else if (error.code === '42P01') { // Table doesn't exist
      errorMessage = 'Commands table not found';
    }
    
    const errorResponse = {
      success: false,
      error: errorMessage,
      details: error.message,
      workflow_id: workflowId,
      user_id: user_id,
      request_id: requestId,
      timestamp: new Date().toISOString()
    };
    
    console.log(`📤 [${requestId}] Sending error response:`, errorResponse);
    res.status(500).json(errorResponse);
  }
  
  console.log(`🏁 [${requestId}] ===== DELETE WORKFLOW COMMANDS REQUEST END =====\n`);
});

// ALSO UPDATE the existing individual command delete endpoint for better logging:
app.delete('/commands/:id', async (req, res) => {
  const commandId = req.params.id;
  const requestId = `delete-cmd-${Date.now()}`;
  
  console.log(`\n🗑️ [${requestId}] ===== DELETE INDIVIDUAL COMMAND REQUEST =====`);
  console.log(`🗑️ [${requestId}] Command ID: ${commandId}`);
  
  try {
    // First get the command details before deleting
    const getQuery = 'SELECT * FROM commands WHERE id = $1';
    const getResult = await pool.query(getQuery, [commandId]);
    
    if (getResult.rows.length === 0) {
      console.log(`⚠️ [${requestId}] Command ${commandId} not found`);
      return res.status(404).json({
        success: false,
        error: 'Command not found',
        command_id: commandId,
        request_id: requestId
      });
    }
    
    const commandToDelete = getResult.rows[0];
    console.log(`🗑️ [${requestId}] Deleting command: "${commandToDelete.command_name}"`);
    
    // Delete the command
    const deleteQuery = 'DELETE FROM commands WHERE id = $1 RETURNING *';
    const deleteResult = await pool.query(deleteQuery, [commandId]);
    
    const deletedCommand = deleteResult.rows[0];
    
    console.log(`✅ [${requestId}] Successfully deleted command: "${deletedCommand.command_name}"`);
    
    const response = {
      success: true,
      message: 'Command deleted successfully',
      command: {
        id: deletedCommand.id,
        command_name: deletedCommand.command_name,
        workflow_id: deletedCommand.workflow_id
      },
      request_id: requestId
    };
    
    console.log(`📤 [${requestId}] Sending success response:`, response);
    res.json(response);
    
  } catch (error) {
    console.error(`❌ [${requestId}] Error deleting command ${commandId}:`, error);
    
    const errorResponse = {
      success: false,
      error: 'Failed to delete command',
      details: error.message,
      command_id: commandId,
      request_id: requestId
    };
    
    console.log(`📤 [${requestId}] Sending error response:`, errorResponse);
    res.status(500).json(errorResponse);
  }
  
  console.log(`🏁 [${requestId}] ===== DELETE INDIVIDUAL COMMAND REQUEST END =====\n`);
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
  console.log(`   GET  /get-user-id - Generate user ID`);
  console.log(`   POST /voice-command - Voice transcription & execution`);
  console.log(`   POST /execute-command - Text command execution`);
  console.log(`   GET  /commands/:userId - List user commands`);
  console.log(`   POST /save-command - Save new command`);
  console.log(`   DELETE /commands/:id - Delete command`);
  console.log(`\n🔍 Debugging: Watch this console for detailed request logging\n`);
});