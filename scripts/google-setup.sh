#!/usr/bin/env bash
# Optional: automates steps 1-2 of the setup wizard (create project + enable APIs).
# OAuth consent screen and the Web OAuth client can't be created via API - the wizard guides those.
# Usage: gcloud auth login && bash scripts/google-setup.sh [project-id]
set -euo pipefail
PROJECT_ID="${1:-live-event-albums-$RANDOM$RANDOM}"
echo "Creating project: $PROJECT_ID"
gcloud projects create "$PROJECT_ID" --name="Live Event Albums"
gcloud services enable photoslibrary.googleapis.com photospicker.googleapis.com drive.googleapis.com gmail.googleapis.com sheets.googleapis.com --project "$PROJECT_ID"
echo
echo "Done. Project ID (paste it in the setup wizard, step 1): $PROJECT_ID"
