# 🚦 Multimodal AI Message Router

An intelligent, context-aware data pipeline built in Node.js that processes raw text, image, and audio messages using the Gemini API. This system acts as a smart notification filter, dynamically categorizing incoming messages into `notify`, `digest`, or `mute` based on explicit user preferences.

Built as a submission for the HackerRank Hackathon.

## 🧠 Core Architecture & Features

This pipeline was designed with four core engineering pillars:

1. **Native Multimodal Processing:** Bypasses traditional transcription (like Whisper) and OCR pipelines. Raw audio and image buffers are sent as Base64 directly to Gemini, reducing pipeline latency, saving API costs, and preserving the emotional tone of audio notes.
2. **Context-Aware Prompt Engineering:** Protects users from clickbait. The system injects the receiver's JSON preference profile into the AI's System Instructions, ensuring the model prioritizes the receiver's boundaries over a sender's artificial urgency (e.g., "URGENT FLASH SALE!").
3. **Idempotent State Management:** Prevents data loss and duplicate rows. Before making API calls, the script reads `output.csv` to track processed `message_id`s. If the pipeline crashes midway, it safely resumes exactly where it left off.
4. **Fail-Safe Rate Limiting:** Designed to handle API HTTP 429 (Resource Exhausted) errors. The current implementation utilizes a manual failover (`process.exit(1)`) to safely halt execution without corrupting data, working in tandem with the state management system to allow seamless restarts.

## 🛠️ Prerequisites

* Node.js (v18 or higher recommended)
* A valid Google Gemini API Key
* A `.env` file containing your environment variables

## 🚀 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/yourusername/your-repo-name.git](https://github.com/yourusername/your-repo-name.git)
   cd your-repo-name