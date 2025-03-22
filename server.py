from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai

app = Flask(__name__)
CORS(app)

@app.route('/generate', methods=['POST'])
def generate_answer():
    try:
        data = request.get_json()
        api_key = data.get('api_key')
        question = data.get('question')
        options = data.get('options')
        
        if not all([api_key, question, options]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"Question: {question}\nOptions: {options}\n\nAnalyze the question and options carefully. Return only the number (1, 2, 3, etc.) of the correct answer."
        
        response = model.generate_content(prompt)
        answer = response.text.strip()
        
        return jsonify({'answer': answer})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)