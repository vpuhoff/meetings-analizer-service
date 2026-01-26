import requests
import time
import sys
import json
import os

class MeetingClient:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url.rstrip('/')

    def process_meeting(self, file_paths, language="English", project_context=None, team_context=None):
        """
        Uploads one or multiple files and polls for the result.
        """
        files_payload = []
        open_files = []

        # Validate paths and open files
        for path in file_paths:
            if not os.path.exists(path):
                print(f"[-] File not found: {path}")
                continue
            f = open(path, 'rb')
            open_files.append(f)
            files_payload.append(('files', (os.path.basename(path), f, 'application/octet-stream')))
            print(f"[*] Preparing file: {path}")

        if not files_payload:
            print("[-] No valid files to upload.")
            return None

        data = {'language': language}
        if project_context:
            data['context'] = project_context
        if team_context:
            data['team'] = team_context

        try:
            print("[*] Uploading files...")
            response = requests.post(f"{self.base_url}/v1/process-meeting", files=files_payload, data=data)
            response.raise_for_status()
            task_data = response.json()
            task_id = task_data.get('task_id')
            print(f"[+] Files accepted. Task ID: {task_id}")
        except requests.exceptions.RequestException as e:
            print(f"[-] Error submitting task: {e}")
            return None
        finally:
            # Close all opened files
            for f in open_files:
                f.close()

        # Poll for results
        return self._wait_for_completion(task_id)

    def generate_report(self, analysis_data, language="English"):
        """
        Sends the analysis JSON to the server to generate a Markdown report.
        """
        print("[*] Generating Markdown report...")
        try:
            payload = {
                "analysis": analysis_data,
                "language": language
            }
            # Increase timeout as generation might take a few seconds
            response = requests.post(f"{self.base_url}/v1/generate-report", json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            return data.get("report")
        except requests.exceptions.RequestException as e:
            print(f"[-] Error generating report: {e}")
            return None

    def _wait_for_completion(self, task_id, interval=3):
        print("[*] Waiting for analysis to complete...")
        url = f"{self.base_url}/v1/results/{task_id}"
        
        while True:
            try:
                response = requests.get(url)
                response.raise_for_status()
                data = response.json()
                status = data.get('status')

                if status == 'completed':
                    print("[+] Analysis completed successfully!")
                    return data.get('result')
                elif status == 'failed':
                    error = data.get('error', 'Unknown error')
                    print(f"[-] Analysis failed: {error}")
                    return None
                elif status == 'processing':
                    # Still working, wait and retry
                    sys.stdout.write('.')
                    sys.stdout.flush()
                    time.sleep(interval)
                else:
                    print(f"[?] Unknown status: {status}")
                    return None
            except requests.exceptions.RequestException as e:
                print(f"\n[-] Network error while polling: {e}")
                return None
            except KeyboardInterrupt:
                print("\n[!] Polling cancelled by user.")
                return None

if __name__ == "__main__":
    # Example Usage
    CLIENT = MeetingClient(base_url="http://localhost:3000")
    
    # Check if file argument is provided
    if len(sys.argv) < 2:
        print("Usage: python client.py <path_to_audio_file> [more_files...]")
        sys.exit(1)

    # Collect all arguments after the script name as file paths
    FILE_PATHS = sys.argv[1:]
    LANGUAGE = "English"
    
    # Optional contexts
    PROJECT_CTX = "Project Phoenix: A migration from monolith to microservices using Kubernetes."
    TEAM_CTX = "Alice: Backend Lead\nBob: Frontend Dev\nCharlie: Product Manager"

    RESULT = CLIENT.process_meeting(
        file_paths=FILE_PATHS,
        language=LANGUAGE,
        project_context=PROJECT_CTX,
        team_context=TEAM_CTX
    )

    if RESULT:
        print("\n" + "="*40)
        print("MEETING INTELLIGENCE REPORT")
        print("="*40)
        print(f"TYPE:    {RESULT.get('meetingType')}")
        print("-" * 40)
        print(f"SUMMARY: {RESULT.get('summary')}")
        
        print("\nACTION ITEMS:")
        for item in RESULT.get('actionItems', []):
            print(f"- [ ] {item.get('what')} (Assignee: {item.get('who')})")
        
        print("\nTECH DETAILS:")
        print(", ".join(RESULT.get('techDetails', [])))

        # Save JSON to file
        timestamp = int(time.time())
        json_filename = f"analysis_{timestamp}.json"
        with open(json_filename, 'w', encoding='utf-8') as f:
            json.dump(RESULT, f, indent=2, ensure_ascii=False)
        print(f"\n[+] JSON result saved to {json_filename}")

        # Generate and Save Markdown Report
        markdown_report = CLIENT.generate_report(RESULT, language=LANGUAGE)
        if markdown_report:
            md_filename = f"report_{timestamp}.md"
            with open(md_filename, 'w', encoding='utf-8') as f:
                f.write(markdown_report)
            print(f"[+] Markdown report saved to {md_filename}")