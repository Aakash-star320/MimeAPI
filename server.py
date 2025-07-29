import whisper
import os
import tempfile
import logging
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import time
import traceback

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

print("🚀 ===== FASTAPI WHISPER SERVER STARTING =====")
print(f"📅 Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
print("🎤 Initializing Whisper transcription server...")

app = FastAPI(
    title="Whisper Transcription Server", 
    version="1.0.0",
    description="OpenAI Whisper speech-to-text service for Automa voice commands"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global whisper model - load once at startup
whisper_model = None

class TranscriptionResponse(BaseModel):
    success: bool
    transcription: str
    message: Optional[str] = None
    processing_time_ms: Optional[int] = None
    language: Optional[str] = None
    confidence: Optional[float] = None

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    print(f"\n📨 [FastAPI] Incoming request: {request.method} {request.url.path}")
    print(f"📨 [FastAPI] Headers: {dict(request.headers)}")
    print(f"📨 [FastAPI] Client: {request.client.host}:{request.client.port}")
    
    response = await call_next(request)
    
    process_time = (time.time() - start_time) * 1000
    print(f"📤 [FastAPI] Response: {response.status_code} in {process_time:.0f}ms")
    
    return response

@app.on_event("startup")
async def startup_event():
    """Load Whisper model on startup"""
    global whisper_model
    try:
        print("🔄 [FastAPI] Loading Whisper model...")
        print("🔄 [FastAPI] This may take a few seconds on first run...")
        
        start_time = time.time()
        
        # Load the base model (good balance of speed vs accuracy)
        # Options: tiny, base, small, medium, large
        print("🔄 [FastAPI] Downloading/loading 'base' model...")
        whisper_model = whisper.load_model("base")
        
        load_time = (time.time() - start_time) * 1000
        print(f"✅ [FastAPI] Whisper model loaded successfully in {load_time:.0f}ms")
        print(f"✅ [FastAPI] Model type: base")
        print(f"✅ [FastAPI] Ready to accept transcription requests!")
        
    except Exception as e:
        print(f"❌ [FastAPI] Failed to load Whisper model: {e}")
        print(f"❌ [FastAPI] Traceback: {traceback.format_exc()}")
        raise e

@app.get("/")
async def root():
    """Health check endpoint"""
    print("🏠 [FastAPI] Root endpoint accessed")
    return {
        "message": "Whisper Transcription Server is running",
        "model_loaded": whisper_model is not None,
        "version": "1.0.0",
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
        "status": "ready" if whisper_model else "loading"
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    print("🏥 [FastAPI] Health check endpoint accessed")
    
    health_data = {
        "status": "healthy" if whisper_model else "loading",
        "model_loaded": whisper_model is not None,
        "model_type": "base" if whisper_model else None,
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
    }
    
    print(f"🏥 [FastAPI] Health status: {health_data}")
    return health_data

@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Transcribe audio file to text using OpenAI Whisper
    
    Args:
        audio: Audio file (WAV, MP3, WebM, etc.)
        
    Returns:
        TranscriptionResponse with transcribed text
    """
    request_id = f"whisper-{int(time.time() * 1000)}"
    start_time = time.time()
    temp_file_path = None
    
    print(f"\n🎤 [FastAPI] ===== TRANSCRIPTION REQUEST START [{request_id}] =====")
    print(f"🕒 [FastAPI] [{request_id}] Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        print(f"🎤 [FastAPI] [{request_id}] Starting transcription request")
        
        # Check if model is loaded
        if whisper_model is None:
            print(f"❌ [FastAPI] [{request_id}] Whisper model not loaded!")
            raise HTTPException(
                status_code=503, 
                detail="Whisper model not loaded. Please restart the server."
            )
        
        print(f"✅ [FastAPI] [{request_id}] Whisper model is ready")
        
        # Log file details
        print(f"📁 [FastAPI] [{request_id}] File details:")
        print(f"     Filename: {audio.filename}")
        print(f"     Content-Type: {audio.content_type}")
        
        # Validate file
        if not audio.filename:
            print(f"❌ [FastAPI] [{request_id}] No filename provided")
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Read uploaded file
        print(f"📖 [FastAPI] [{request_id}] Reading uploaded audio data...")
        audio_data = await audio.read()
        
        print(f"📊 [FastAPI] [{request_id}] Audio data size: {len(audio_data)} bytes")
        
        if len(audio_data) < 1000:  # Less than 1KB
            print(f"⚠️ [FastAPI] [{request_id}] Audio file very small: {len(audio_data)} bytes")
            return TranscriptionResponse(
                success=False,
                transcription="",
                message=f"Audio file too small: {len(audio_data)} bytes",
                processing_time_ms=int((time.time() - start_time) * 1000)
            )
        
        print(f"✅ [FastAPI] [{request_id}] Audio data looks valid")
        
        # Create temporary file
        print(f"💾 [FastAPI] [{request_id}] Creating temporary file...")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_file.write(audio_data)
            temp_file_path = temp_file.name
            print(f"💾 [FastAPI] [{request_id}] Saved to temporary file: {temp_file_path}")
            print(f"💾 [FastAPI] [{request_id}] Temp file size: {os.path.getsize(temp_file_path)} bytes")
        
        # Transcribe using Whisper
        print(f"🔊 [FastAPI] [{request_id}] Starting Whisper transcription...")
        transcription_start = time.time()
        
        print(f"🔊 [FastAPI] [{request_id}] Whisper options:")
        print(f"     Language: en (English)")
        print(f"     Task: transcribe")
        print(f"     FP16: False")
        print(f"     Verbose: False")
        
        # Transcribe with options
        result = whisper_model.transcribe(
            temp_file_path,
            language="en",  # Force English for better accuracy
            task="transcribe",  # transcribe (not translate)
            fp16=False,  # Use FP32 for better compatibility
            verbose=False  # Reduce output
        )
        
        transcription_time = (time.time() - transcription_start) * 1000
        print(f"✅ [FastAPI] [{request_id}] Whisper transcription completed in {transcription_time:.0f}ms")
        
        # Extract transcribed text
        transcribed_text = result["text"].strip()
        detected_language = result.get("language", "unknown")
        
        print(f"📝 [FastAPI] [{request_id}] Raw transcription: '{result['text']}'")
        print(f"📝 [FastAPI] [{request_id}] Cleaned transcription: '{transcribed_text}'")
        print(f"🌍 [FastAPI] [{request_id}] Detected language: {detected_language}")
        
        # Calculate confidence (average of segment confidences if available)
        confidence = None
        if "segments" in result and result["segments"]:
            confidences = [seg.get("avg_logprob", 0) for seg in result["segments"] if "avg_logprob" in seg]
            if confidences:
                # Convert log probability to a 0-1 confidence score (approximate)
                avg_logprob = sum(confidences) / len(confidences)
                confidence = min(1.0, max(0.0, (avg_logprob + 1.0)))  # Rough conversion
                print(f"📊 [FastAPI] [{request_id}] Calculated confidence: {confidence:.3f}")
            else:
                print(f"📊 [FastAPI] [{request_id}] No confidence data available")
        else:
            print(f"📊 [FastAPI] [{request_id}] No segments data for confidence calculation")
        
        processing_time = int((time.time() - start_time) * 1000)
        
        print(f"⏱️ [FastAPI] [{request_id}] Total processing time: {processing_time}ms")
        print(f"⏱️ [FastAPI] [{request_id}] Transcription time: {transcription_time:.0f}ms")
        
        if not transcribed_text:
            print(f"⚠️ [FastAPI] [{request_id}] No speech detected in audio")
            return TranscriptionResponse(
                success=False,
                transcription="",
                message="No speech detected in audio",
                processing_time_ms=processing_time,
                language=detected_language
            )
        
        response_data = TranscriptionResponse(
            success=True,
            transcription=transcribed_text,
            message="Transcription successful",
            processing_time_ms=processing_time,
            language=detected_language,
            confidence=confidence
        )
        
        print(f"📤 [FastAPI] [{request_id}] Sending success response:")
        print(f"     Success: {response_data.success}")
        print(f"     Transcription: '{response_data.transcription}'")
        print(f"     Language: {response_data.language}")
        print(f"     Confidence: {response_data.confidence}")
        print(f"     Processing time: {response_data.processing_time_ms}ms")
        
        return response_data
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        error_msg = f"Transcription failed: {str(e)}"
        
        print(f"❌ [FastAPI] [{request_id}] EXCEPTION during transcription:")
        print(f"❌ [FastAPI] [{request_id}] Exception type: {type(e).__name__}")
        print(f"❌ [FastAPI] [{request_id}] Exception message: {str(e)}")
        print(f"❌ [FastAPI] [{request_id}] Full traceback:")
        print(traceback.format_exc())
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": error_msg,
                "processing_time_ms": processing_time,
                "request_id": request_id
            }
        )
    
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                print(f"🗑️ [FastAPI] [{request_id}] Cleaned up temporary file")
            except Exception as cleanup_error:
                print(f"❌ [FastAPI] [{request_id}] Failed to cleanup temp file: {cleanup_error}")
        
        print(f"🏁 [FastAPI] [{request_id}] ===== TRANSCRIPTION REQUEST END =====\n")

if __name__ == "__main__":
    print("\n🎉 ===== FASTAPI SERVER CONFIGURATION =====")
    print("📦 Required packages: openai-whisper, fastapi, uvicorn, python-multipart")
    print("🌐 Server will run on: http://localhost:8001")
    print("📖 API docs available at: http://localhost:8001/docs")
    print("🏥 Health check: http://localhost:8001/health")
    print("🎤 Transcription endpoint: POST http://localhost:8001/transcribe")
    print("\n💡 Usage:")
    print("   1. Start this server: python whisper_server.py")
    print("   2. Start Express server: node server.js")
    print("   3. Use browser extension")
    print("\n🔍 Debug:")
    print("   - Watch this console for detailed transcription logs")
    print("   - Test endpoint at /docs with a WAV file")
    print("   - Check /health for model status")
    
    print(f"\n🚀 Starting FastAPI server...")
    
    # Run the server
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8001,
        log_level="info",
        access_log=True
    )