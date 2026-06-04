from flask import Flask, render_template, request, jsonify
from openai import OpenAI
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# ✅ OpenRouter setup
client = OpenAI(
    api_key="",
    base_url="https://openrouter.ai/api/v1",
    default_headers={
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Polyglot Voice Assistant"
    }
)

lang_map = {
    "en": "English",
    "hi": "Hindi",
    "mr": "Marathi",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Mandarin Chinese",
    "ar": "Arabic",
    "tr": "Turkish",
    "te": "Telugu"
}

@app.route('/')
def home():
    return render_template('index.html')


@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"reply": "⚠️ Invalid request."}), 400

        user_text = data.get('message', '').strip()
        target_lang = data.get('lang', 'en')
        # history: list of {role, content} objects from the frontend
        history = data.get('history', [])

        if not user_text:
            return jsonify({"reply": "Please say or type something."}), 400

        target_lang_full = lang_map.get(target_lang, "English")
        logging.info(f"[Chat] lang={target_lang_full} | history_len={len(history)} | msg={user_text[:60]}")

        # Build messages: system + history + current user message
        system_prompt = {
            "role": "system",
            "content": (
                f"You are Polyglot, an intelligent and friendly multilingual AI assistant. "
                f"You MUST reply ONLY in {target_lang_full}. "
                f"Never mix languages. "
                f"Give helpful, accurate, and natural answers. "
                f"Be concise unless the user asks for detail. "
                f"You can answer questions, have conversations, explain topics, translate phrases, and assist with any task. "
                f"You remember the full conversation history and can refer to earlier messages."
            )
        }

        # Sanitize history to only include role/content
        safe_history = [
            {"role": m["role"], "content": m["content"]}
            for m in history
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]

        messages = [system_prompt] + safe_history + [{"role": "user", "content": user_text}]

        response = client.chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=messages,
            temperature=0.65,
            max_tokens=800
        )

        reply = response.choices[0].message.content.strip()
        return jsonify({"reply": reply})

    except Exception as e:
        logging.error(f"[Chat Error] {str(e)}")
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500


@app.route('/health')
def health():
    return jsonify({"status": "ok", "model": "gpt-4o-mini", "languages": len(lang_map)})


if __name__ == '__main__':
    app.run(debug=True, port=5000)