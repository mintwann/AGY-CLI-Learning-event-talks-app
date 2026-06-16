import os
import json
import time
import xml.etree.ElementTree as ET
import requests
from flask import Flask, jsonify, render_template, request, send_from_directory
from bs4 import BeautifulSoup

app = Flask(__name__, static_folder='static', template_folder='templates')

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "releases_cache.json"
CACHE_DURATION_SEC = 3600  # 1 hour

def parse_html_content(html_content):
    """
    Parses the CDATA HTML content from the feed entry and extracts categorized updates.
    The feed content typically has <h3>Category</h3> followed by <p> or <ul> tags.
    """
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, 'html.parser')
    updates = []
    
    current_type = 'Feature'
    current_element_buffer = []

    def flush_buffer():
        nonlocal current_element_buffer
        if current_element_buffer:
            # Join the HTML elements together
            html_str = "".join(str(el) for el in current_element_buffer)
            # Create a combined BS4 fragment to extract text cleanly
            temp_soup = BeautifulSoup(html_str, 'html.parser')
            text_str = temp_soup.get_text().strip()
            if text_str:
                updates.append({
                    'type': current_type,
                    'html': html_str,
                    'text': text_str
                })
            current_element_buffer = []

    # Iterate through direct children of body/soup
    for child in soup.contents:
        if child.name == 'h3':
            # Found a new heading type. Flush the previous category's content
            flush_buffer()
            current_type = child.get_text().strip()
        elif child.name in ['p', 'ul', 'ol']:
            current_element_buffer.append(child)
        elif child.name is None:
            # Text nodes
            if child.strip():
                # Wrap raw text nodes in a span/paragraph if needed
                current_element_buffer.append(child)
                
    # Flush remaining buffer
    flush_buffer()
    
    # If the parser couldn't structure it, fall back to returning the whole HTML as a single release item
    if not updates:
        updates.append({
            'type': 'Release',
            'html': html_content,
            'text': soup.get_text().strip()
        })
        
    return updates

def fetch_and_parse_feed(force_refresh=False):
    """
    Fetches the BigQuery Atom feed, parses it, and caches the results to a file.
    If the cache is valid and force_refresh is False, loads from cache.
    """
    # Check cache validity
    if not force_refresh and os.path.exists(CACHE_FILE):
        mtime = os.path.getmtime(CACHE_FILE)
        if time.time() - mtime < CACHE_DURATION_SEC:
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f), "cache"
            except Exception as e:
                # If cache read fails, proceed to fetch
                app.logger.warning(f"Failed to read cache: {e}")

    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        xml_data = response.content
        
        # Parse Atom Feed XML
        # Atom Namespace
        namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
        root = ET.fromstring(xml_data)
        
        entries = []
        for entry_elem in root.findall('atom:entry', namespaces):
            title_elem = entry_elem.find('atom:title', namespaces)
            date_str = title_elem.text.strip() if title_elem is not None else 'Unknown Date'
            
            updated_elem = entry_elem.find('atom:updated', namespaces)
            updated_str = updated_elem.text.strip() if updated_elem is not None else ''
            
            id_elem = entry_elem.find('atom:id', namespaces)
            id_str = id_elem.text.strip() if id_elem is not None else ''
            
            # Extract link
            link = ''
            for link_elem in entry_elem.findall('atom:link', namespaces):
                # We prefer the alternate link
                rel = link_elem.attrib.get('rel', 'alternate')
                if rel == 'alternate':
                    link = link_elem.attrib.get('href', '')
                    break
            if not link:
                link_elem = entry_elem.find('atom:link', namespaces)
                if link_elem is not None:
                    link = link_elem.attrib.get('href', '')
            
            content_elem = entry_elem.find('atom:content', namespaces)
            html_content = content_elem.text if content_elem is not None else ''
            
            # Parse sub-updates inside the HTML content
            updates = parse_html_content(html_content)
            
            entries.append({
                'date': date_str,
                'updated': updated_str,
                'id': id_str,
                'link': link,
                'updates': updates
            })
            
        # Save to cache file
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
            
        return entries, "network"
        
    except Exception as e:
        # If network fetch fails, attempt to fall back to cached data, even if expired
        app.logger.error(f"Failed to fetch feed: {e}")
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f), "stale_cache"
            except Exception as cache_err:
                pass
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases', methods=['GET'])
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        entries, source = fetch_and_parse_feed(force_refresh=force_refresh)
        return jsonify({
            'success': True,
            'source': source,
            'count': len(entries),
            'entries': entries
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Run locally on 127.0.0.1:5000
    app.run(debug=True, host='127.0.0.1', port=5000)
