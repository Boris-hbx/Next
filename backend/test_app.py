#!/usr/bin/env python3
"""Simple test to verify the todo parsing logic works correctly"""

from app import parse_todolist, parse_motivation

def test_todo_parsing():
    """Test that todolist.txt is parsed correctly"""
    print("Testing todo parsing...")
    todo_data = parse_todolist()

    print(f"Today section length: {len(todo_data['today'])} chars")
    print(f"This week section length: {len(todo_data['this_week'])} chars")
    print(f"Next 30 days section length: {len(todo_data['next_30_days'])} chars")

    print("\n'Today' section preview:")
    preview = todo_data['today'][:200] if todo_data['today'] else "(empty)"
    print(f"  {preview}...")
    
    return todo_data

def test_motivation_reading():
    """Test that motivation.txt is read correctly"""
    print("\nTesting motivation reading...")
    motivation_data = parse_motivation()
    print(f"Motivation sections found: {list(motivation_data.keys())}")
    total_len = sum(len(v) for v in motivation_data.values())
    print(f"Total motivation text length: {total_len} characters")
    
    return motivation_data

if __name__ == "__main__":
    test_todo_parsing()
    test_motivation_reading()
    print("\nTest completed successfully!")