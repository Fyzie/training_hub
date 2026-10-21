# IRnow Workspace - Office PC Setup & 1-Click Run Guide

This project contains everything needed to run the **IRnow Workspace** portal (Web UI, Python FastAPI telemetry/training backend, and optional Cloudflare tunnel).

---

## 🚀 1-Click Launch (Daily Use)

Whenever you want to start the whole system:
1. Double-click **`start_hub.bat`** (or the Desktop shortcut created via `create_desktop_shortcut.bat`).
2. Everything starts automatically in the background:
   - **Next.js Web Portal** (`http://localhost:3000` and `http://<YOUR_IP>:3000`)
   - **Python FastAPI Backend** (`http://localhost:8000`)
   - **Cloudflare Tunnel** (if `cloudflared` is installed)
3. Your default web browser will automatically open to `http://localhost:3000`.

To stop everything when done, press **`Q`** in the launcher window or double-click **`stop_hub.bat`**.

---

## 💻 Moving to Your Office PC (First-Time Setup)

When copying this folder to your office workstation:

### Step 1: Prerequisites
Ensure the office PC has:
1. **Node.js (v18 or newer)**: Download from [https://nodejs.org](https://nodejs.org)
2. **Python (3.10+ or Anaconda)**: Standard Python or Anaconda distribution.

### Step 2: One-Click Configuration
Double-click:
```
setup_office_pc.batcl
```
This script will automatically:
- Install Python dependencies from `requirements.txt` (`fastapi`, `uvicorn`, `roboflow`, `psutil`, etc.).
- Install Node dependencies (`npm install`).
- Build the optimized production bundle (`npm run build`).

### Step 3: Run
Double-click **`start_hub.bat`** and you are ready!

---

## 📁 Key Launcher Files

| File | Purpose |
|---|---|
| **`start_hub.bat`** | **Primary 1-Click Launcher** - starts all services, detects your IP, and opens the browser. |
| **`stop_hub.bat`** | **1-Click Shutdown** - stops background services on ports 3000 and 8000 cleanly. |
| **`setup_office_pc.bat`** | First-time configuration script for new PCs (`pip install` + `npm install` + `npm run build`). |
| **`create_desktop_shortcut.bat`** | Adds a clickable "IRnow Workspace" shortcut directly to your Windows Desktop. |
| **`requirements.txt`** | List of Python dependencies for FastAPI backend. |
| **`run_backend.py`** | Script that starts the Uvicorn FastAPI server on `0.0.0.0:8000`. |

---

## 🌐 Network Access Summary

- **Local PC**: `http://localhost:3000`
- **Phone / Office Wi-Fi LAN**: `http://<Office-PC-IP>:3000`
- **FastAPI API Docs (Swagger)**: `http://localhost:8000/docs`


---

### 📁 New 1-Click Files Created

| File | What It Does |
|---|---|
| **[`start_hub.bat`](file:///d:/Github/hub/start_hub.bat)** | **The Main 1-Click Launcher**: Double-click this file to start the entire system! It automatically detects Python/Node, clears old ports, starts all services (Next.js, FastAPI, Cloudflare tunnel), detects your local LAN IP, and opens your browser directly to [`http://localhost:3000`](http://localhost:3000). |
| **[`stop_hub.bat`](file:///d:/Github/hub/stop_hub.bat)** | **1-Click Shutdown**: Double-click anytime to cleanly terminate all background services on ports 3000 and 8000. |
| **[`create_desktop_shortcut.bat`](file:///d:/Github/hub/create_desktop_shortcut.bat)** | Double-click once to place a **"IRnow Workspace"** desktop shortcut on your Windows Desktop pointing directly to `start_hub.bat`. |
| **[`setup_office_pc.bat`](file:///d:/Github/hub/setup_office_pc.bat)** | **Initial Setup on Office PC**: When you copy the folder to your office PC, double-click this once to automatically run `pip install -r requirements.txt`, `npm install`, and `npm run build`. |
| **[`requirements.txt`](file:///d:/Github/hub/requirements.txt)** | Python dependencies list (`fastapi`, `uvicorn`, `roboflow`, `psutil`, etc.). |
| **[`README_OFFICE_PC.md`](file:///d:/Github/hub/README_OFFICE_PC.md)** | Step-by-step instructions for copying and running on your office PC. |

---

### 🖥️ How It Works When You Double-Click `start_hub.bat`

1. **Auto-Detects Environments**:
   - Searches for Python in `PATH`, Anaconda (`%USERPROFILE%\anaconda3`, `C:\ProgramData\anaconda3`), or Miniconda.
   - Verifies Node.js (and runs `npm run build` automatically if the build folder is missing).
2. **Starts Services**:
   - **Next.js Web Portal** on `http://0.0.0.0:3000`
   - **FastAPI Telemetry & Training Backend** on `http://0.0.0.0:8000`
   - **Cloudflare Quick Tunnel** (if `cloudflared` is detected)
3. **Interactive Control Console**:
   The terminal window displays a live status dashboard:
   ```text
   =====================================================================
                   IRnow Workspace - WORKSTATION PORTAL
   =====================================================================

     [ACTIVE SERVICES]
     -------------------------------------------------------------------
     * Web Portal:       http://localhost:3000
     * Local Network:    http://192.168.8.105:3000
     * Python FastAPI:   http://localhost:8000  (Docs: /docs)
     -------------------------------------------------------------------

     [CONTROLS]
     1. Open Web Portal in Browser (http://localhost:3000)
     2. Open FastAPI API Docs (http://localhost:8000/docs)
     3. Restart All Services
     Q. Stop All Services and Exit
   =====================================================================
   ```
4. **Auto-Opens Browser**:
   Immediately opens your default web browser to `http://localhost:3000`.
5. **Clean Exit**:
   Pressing **`Q`** in the window or closing it stops all background processes cleanly without leaving orphaned ports behind.

---

### 📋 Checklist When Copying to Your Office PC

1. **Copy the `hub` folder** to your office PC (via USB drive or network share).
2. Ensure the office PC has:
   - **Node.js** (v18+)
   - **Python** (3.10+ or Anaconda)
3. Run **`setup_office_pc.bat`** once.
4. From then on, simply double-click **`start_hub.bat`** (or the Desktop shortcut) to launch the entire hub with one click.