#!/usr/bin/env python3
"""
Meeting Summary Generator

A Python script that generates structured meeting summaries from transcripts
using Google's Gemini AI API.

Usage:
    python meeting_summarizer.py transcript.txt
    python meeting_summarizer.py --input transcript.txt --output summary.md
    cat transcript.txt | python meeting_summarizer.py

Environment Variables:
    GEMINI_API_KEY: Required. Your Google Gemini API key.
"""

import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

try:
    import google.generativeai as genai
except ImportError:
    print("Error: google-generativeai package not installed.")
    print("Install with: pip install google-generativeai")
    sys.exit(1)


def get_api_key() -> str:
    """Get Gemini API key from environment variable."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set.")
        print("Please set your Gemini API key:")
        print("  export GEMINI_API_KEY='your-api-key-here'")
        sys.exit(1)
    return api_key


def configure_gemini(api_key: str) -> genai.GenerativeModel:
    """Configure and return the Gemini model."""
    genai.configure(api_key=api_key)
    # Use gemini-2.0-flash-lite for cost-effectiveness
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash-lite",
        system_instruction="""You are an expert meeting assistant. Your task is to analyze meeting transcripts and generate structured, professional meeting summaries.

Extract and organize the following information:
1. Meeting title (infer from content or use generic title)
2. Meeting date (if mentioned, otherwise use current date)
3. List of attendees/participants mentioned
4. Executive summary (2-3 sentences)
5. Key decisions made
6. Action items with owners and deadlines
7. Topics discussed
8. Any unresolved issues or follow-ups needed

Format the output in clean Markdown. Be concise but comprehensive."""
    )
    return model


def read_transcript(input_source: Optional[str] = None) -> str:
    """Read transcript from file or stdin."""
    if input_source:
        # Read from file
        file_path = Path(input_source)
        if not file_path.exists():
            print(f"Error: File not found: {input_source}")
            sys.exit(1)
        return file_path.read_text(encoding='utf-8')
    else:
        # Read from stdin
        if sys.stdin.isatty():
            print("Error: No input provided.")
            print("Usage: python meeting_summarizer.py transcript.txt")
            print("   or: cat transcript.txt | python meeting_summarizer.py")
            sys.exit(1)
        return sys.stdin.read()


def generate_summary(model: genai.GenerativeModel, transcript: str) -> str:
    """Generate meeting summary using Gemini API."""
    prompt = f"""Please analyze the following meeting transcript and generate a structured meeting summary:

---

{transcript}

---

Generate a professional meeting summary in Markdown format with the following sections:

# Meeting Summary

**Date:** [Extracted or current date]
**Duration:** [If calculable from timestamps]

## Attendees
- [List all participants mentioned]

## Executive Summary
[Brief 2-3 sentence overview]

## Topics Discussed
- [Topic 1]
- [Topic 2]
...

## Key Decisions
1. [Decision 1]
2. [Decision 2]
...

## Action Items
| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| [Action 1] | [Owner] | [Date] | Pending |
| [Action 2] | [Owner] | [Date] | Pending |

## Unresolved Issues / Follow-ups
- [Issue 1]
- [Issue 2]
...

## Next Meeting
[If mentioned: date/time and agenda preview]"""

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
                max_output_tokens=4096,
            )
        )
        return response.text
    except Exception as e:
        print(f"Error generating summary: {e}")
        sys.exit(1)


def generate_json_summary(model: genai.GenerativeModel, transcript: str) -> Dict:
    """Generate structured JSON summary for programmatic use."""
    prompt = f"""Analyze this meeting transcript and return a JSON object with meeting details.

Transcript:
---
{transcript}
---

Return ONLY valid JSON in this exact format:
{{
    "title": "Meeting Title",
    "date": "YYYY-MM-DD",
    "duration_minutes": 45,
    "attendees": ["Person 1", "Person 2"],
    "executive_summary": "Brief summary text",
    "topics": ["Topic 1", "Topic 2"],
    "decisions": ["Decision 1", "Decision 2"],
    "action_items": [
        {{
            "action": "Description",
            "owner": "Person Name",
            "deadline": "YYYY-MM-DD",
            "status": "pending"
        }}
    ],
    "unresolved_issues": ["Issue 1"],
    "next_meeting": {{
        "date": "YYYY-MM-DD",
        "time": "HH:MM",
        "agenda_preview": "Brief agenda"
    }}
}}

Use null for any fields not found in the transcript. Current date if none specified."""

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.2,
                max_output_tokens=4096,
            )
        )
        
        # Extract JSON from response
        text = response.text.strip()
        
        # Remove markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        
        return json.loads(text.strip())
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON response: {e}")
        print("Raw response:", response.text)
        sys.exit(1)
    except Exception as e:
        print(f"Error generating JSON summary: {e}")
        sys.exit(1)


def save_output(content: str, output_path: Optional[str] = None) -> None:
    """Save output to file or print to stdout."""
    if output_path:
        Path(output_path).write_text(content, encoding='utf-8')
        print(f"Summary saved to: {output_path}")
    else:
        print(content)


def main():
    parser = argparse.ArgumentParser(
        description="Generate structured meeting summaries from transcripts using AI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s meeting.txt                    # Generate and print summary
  %(prog)s meeting.txt -o summary.md     # Save to file
  cat meeting.txt | %(prog)s              # Read from stdin
  %(prog)s meeting.txt --json            # Output structured JSON
        """
    )
    
    parser.add_argument(
        "input",
        nargs="?",
        help="Path to transcript file (reads from stdin if not provided)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output file path (prints to stdout if not provided)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as structured JSON instead of Markdown"
    )
    parser.add_argument(
        "--model",
        default="gemini-2.0-flash-lite",
        help="Gemini model to use (default: gemini-2.0-flash-lite)"
    )
    
    args = parser.parse_args()
    
    # Check for API key
    api_key = get_api_key()
    
    # Read transcript
    transcript = read_transcript(args.input)
    
    if not transcript.strip():
        print("Error: Empty transcript")
        sys.exit(1)
    
    # Configure Gemini
    model = configure_gemini(api_key)
    
    print("Generating meeting summary...", file=sys.stderr)
    
    # Generate summary
    if args.json:
        summary = generate_json_summary(model, transcript)
        output = json.dumps(summary, indent=2, ensure_ascii=False)
    else:
        output = generate_summary(model, transcript)
    
    # Output result
    save_output(output, args.output)


if __name__ == "__main__":
    main()
