import subprocess
import json
import requests

# For local testing, keep this as localhost. 
# BEFORE YOUR PITCH: Change this to your Render URL (e.g., 'https://ecosync.onrender.com')
LIVE_URL = 'http://localhost:3000'

# Open subprocess with stdin enabled for two-way communication
process = subprocess.Popen(
    ['./sensor_sim.exe'],
    stdout=subprocess.PIPE,
    stdin=subprocess.PIPE,
    text=True
)

print(f"Grid Pipeline Active. Monitoring hardware and syncing with {LIVE_URL}...")

try:
    for line in process.stdout:
        try:
            data = json.loads(line.strip())
            
            # 1. Forward ALL live data to the Node.js server
            requests.post(f'{LIVE_URL}/api/data', json=data, timeout=2)
            
            # 2. Ask the server if any dashboard buttons were pressed
            try:
                cmd_res = requests.get(f'{LIVE_URL}/api/poll-commands', timeout=2)
                if cmd_res.status_code == 200:
                    commands = cmd_res.json().get('commands', [])
                    for cmd in commands:
                        print(f"🔧 CLOUD ACTUATION TRIGGERED: Sending {cmd} to Hardware")
                        process.stdin.write(cmd + '\n')
                        process.stdin.flush()
            except requests.exceptions.RequestException:
                pass # Fail silently if the polling request temporarily drops
                    
        except (json.JSONDecodeError, requests.exceptions.RequestException):
            continue

except KeyboardInterrupt:
    process.kill()
    print("\nPipeline stopped.")