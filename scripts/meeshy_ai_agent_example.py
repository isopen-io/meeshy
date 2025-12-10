#!/usr/bin/env python3
"""
Meeshy AI Agent Example
Demonstrates how to use MMR with AI-friendly format for intelligent conversation agents
"""

import json
import subprocess
import os
from typing import List, Dict, Optional
from datetime import datetime

class MeeshyConversationContext:
    """
    Context manager for Meeshy conversations
    Retrieves and processes messages for AI agent consumption
    """
    
    def __init__(self, 
                 conversation_id: str = "meeshy",
                 mmr_script_path: str = "./mmr.sh"):
        self.conversation_id = conversation_id
        self.mmr_script_path = mmr_script_path
        self.password = os.getenv("MEESHY_PASSWORD")
        
        if not self.password:
            raise ValueError("MEESHY_PASSWORD environment variable must be set")
    
    def get_messages(self, 
                    timeframe: Optional[str] = None,
                    count: Optional[int] = None) -> List[Dict]:
        """
        Retrieve messages using MMR script
        
        Args:
            timeframe: Time period (e.g., "2h", "1d", "30m")
            count: Number of messages (alternative to timeframe)
        
        Returns:
            List of message dictionaries in AI-friendly format
        """
        cmd = [self.mmr_script_path, "-c", self.conversation_id, "-f", "ai"]
        
        if timeframe:
            cmd.extend(["-t", timeframe])
        elif count:
            cmd.extend(["-n", str(count)])
        else:
            cmd.extend(["-n", "50"])  # Default
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                env={"MEESHY_PASSWORD": self.password},
                check=True
            )
            
            messages = json.loads(result.stdout)
            return messages
            
        except subprocess.CalledProcessError as e:
            print(f"Error retrieving messages: {e.stderr}")
            return []
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON: {e}")
            return []
    
    def build_context_string(self, 
                           timeframe: str = "2h",
                           include_translations: bool = False,
                           max_messages: int = 50) -> str:
        """
        Build a context string suitable for LLM prompts
        
        Args:
            timeframe: Time period for messages
            include_translations: Whether to include translated content
            max_messages: Maximum number of messages to include
        
        Returns:
            Formatted conversation context string
        """
        messages = self.get_messages(timeframe=timeframe)
        
        if not messages:
            return "No recent messages found."
        
        # Limit to max_messages (most recent)
        messages = messages[:max_messages]
        
        context_lines = []
        context_lines.append(f"=== Conversation Context (Last {timeframe}) ===\n")
        
        for msg in messages:
            timestamp = datetime.fromisoformat(msg["timestamp"].replace("Z", "+00:00"))
            sender = msg["sender"]["displayName"] or msg["sender"]["username"]
            
            # Main message
            context_lines.append(
                f"[{timestamp.strftime('%Y-%m-%d %H:%M')}] {sender}: {msg['content']}"
            )
            
            # Include translations if requested
            if include_translations and msg["translations"]:
                for trans in msg["translations"]:
                    context_lines.append(
                        f"  └─ [{trans['language']}] {trans['content']}"
                    )
            
            # Include reply context if present
            if msg["replyTo"]:
                context_lines.append(
                    f"  ↪ Reply to {msg['replyTo']['sender']}: {msg['replyTo']['content'][:100]}..."
                )
            
            context_lines.append("")  # Blank line between messages
        
        return "\n".join(context_lines)
    
    def get_conversation_summary(self, timeframe: str = "1d") -> Dict:
        """
        Get a summary of conversation activity
        
        Returns:
            Dictionary with conversation statistics
        """
        messages = self.get_messages(timeframe=timeframe)
        
        if not messages:
            return {"message_count": 0}
        
        # Analyze messages
        senders = set()
        languages = set()
        has_attachments = 0
        has_replies = 0
        
        for msg in messages:
            senders.add(msg["sender"]["username"])
            languages.add(msg["language"])
            if msg["hasAttachments"]:
                has_attachments += 1
            if msg["replyTo"]:
                has_replies += 1
        
        return {
            "message_count": len(messages),
            "unique_senders": len(senders),
            "languages_used": list(languages),
            "messages_with_attachments": has_attachments,
            "reply_threads": has_replies,
            "timeframe": timeframe,
            "most_recent_message": messages[0] if messages else None
        }
    
    def extract_for_embeddings(self, 
                              timeframe: str = "7d",
                              include_metadata: bool = True) -> List[Dict]:
        """
        Extract messages in format suitable for vector embeddings
        
        Args:
            timeframe: Time period for messages
            include_metadata: Whether to include metadata for each chunk
        
        Returns:
            List of documents with text and metadata
        """
        messages = self.get_messages(timeframe=timeframe)
        
        documents = []
        for msg in messages:
            text = f"{msg['sender']['username']}: {msg['content']}"
            
            doc = {"text": text}
            
            if include_metadata:
                doc["metadata"] = {
                    "message_id": msg["id"],
                    "timestamp": msg["timestamp"],
                    "sender": msg["sender"]["username"],
                    "language": msg["language"],
                    "has_attachments": msg["hasAttachments"]
                }
            
            documents.append(doc)
            
            # Also include translations as separate documents
            for trans in msg["translations"]:
                trans_doc = {
                    "text": f"{msg['sender']['username']}: {trans['content']}"
                }
                if include_metadata:
                    trans_doc["metadata"] = {
                        "message_id": msg["id"],
                        "timestamp": msg["timestamp"],
                        "sender": msg["sender"]["username"],
                        "language": trans["language"],
                        "is_translation": True,
                        "original_language": msg["language"]
                    }
                documents.append(trans_doc)
        
        return documents


# Example usage demonstrations
def example_basic_usage():
    """Basic usage example"""
    print("=== Example 1: Basic Usage ===\n")
    
    context = MeeshyConversationContext()
    
    # Get recent messages
    messages = context.get_messages(timeframe="2h")
    print(f"Retrieved {len(messages)} messages from the last 2 hours")
    
    if messages:
        latest = messages[0]
        print(f"\nLatest message:")
        print(f"  From: {latest['sender']['username']}")
        print(f"  Content: {latest['content'][:100]}...")
        print(f"  Language: {latest['language']}")


def example_llm_context():
    """Example: Building context for LLM"""
    print("\n=== Example 2: LLM Context Building ===\n")
    
    context = MeeshyConversationContext()
    
    # Build context string for LLM
    context_string = context.build_context_string(
        timeframe="2h",
        include_translations=False,
        max_messages=20
    )
    
    print(context_string)
    
    # This context can be used in your LLM prompt:
    # prompt = f"""
    # {context_string}
    # 
    # User question: What were the main topics discussed?
    # 
    # Please provide a summary based on the conversation above.
    # """


def example_conversation_analysis():
    """Example: Analyzing conversation"""
    print("\n=== Example 3: Conversation Analysis ===\n")
    
    context = MeeshyConversationContext()
    
    # Get conversation summary
    summary = context.get_conversation_summary(timeframe="1d")
    
    print("Conversation Summary (Last 24 hours):")
    print(f"  Total messages: {summary['message_count']}")
    print(f"  Active participants: {summary['unique_senders']}")
    print(f"  Languages: {', '.join(summary['languages_used'])}")
    print(f"  Messages with attachments: {summary['messages_with_attachments']}")
    print(f"  Reply threads: {summary['reply_threads']}")


def example_rag_pipeline():
    """Example: Preparing data for RAG system"""
    print("\n=== Example 4: RAG Pipeline Preparation ===\n")
    
    context = MeeshyConversationContext()
    
    # Extract documents for embeddings
    documents = context.extract_for_embeddings(
        timeframe="7d",
        include_metadata=True
    )
    
    print(f"Prepared {len(documents)} documents for embedding")
    
    if documents:
        print(f"\nSample document:")
        print(f"  Text: {documents[0]['text'][:100]}...")
        print(f"  Metadata: {documents[0]['metadata']}")
    
    # These documents can be used with:
    # - OpenAI embeddings
    # - Sentence transformers
    # - Vector databases (Pinecone, Weaviate, Chroma, etc.)


def example_multilingual_processing():
    """Example: Processing multilingual content"""
    print("\n=== Example 5: Multilingual Processing ===\n")
    
    context = MeeshyConversationContext()
    
    messages = context.get_messages(timeframe="1d")
    
    # Group messages by language
    by_language = {}
    for msg in messages:
        lang = msg["language"]
        if lang not in by_language:
            by_language[lang] = []
        by_language[lang].append(msg)
    
    print("Messages by language:")
    for lang, msgs in by_language.items():
        print(f"  {lang}: {len(msgs)} messages")
    
    # Process translations
    print("\nAvailable translations:")
    for msg in messages[:5]:  # First 5 messages
        if msg["translations"]:
            trans_langs = [t["language"] for t in msg["translations"]]
            print(f"  Message {msg['id'][:8]}: {msg['language']} → {', '.join(trans_langs)}")


if __name__ == "__main__":
    print("Meeshy AI Agent Examples")
    print("=" * 60)
    
    try:
        # Run all examples
        example_basic_usage()
        example_llm_context()
        example_conversation_analysis()
        example_rag_pipeline()
        example_multilingual_processing()
        
        print("\n" + "=" * 60)
        print("All examples completed successfully!")
        
    except ValueError as e:
        print(f"\nError: {e}")
        print("\nPlease set MEESHY_PASSWORD environment variable:")
        print("  export MEESHY_PASSWORD='your_password'")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
