#!/bin/bash

# Kjør dette scriptet for å publisere endringer til nettsiden
# Første gang: scriptet spør om commit-melding, resten er automatisk

cd "$(dirname "$0")"

echo ""
echo "📰 Dagens Orden — Publiser endringer"
echo "────────────────────────────────────"
echo ""

# Sjekk om det er noe å publisere
if git diff --quiet && git diff --staged --quiet; then
  echo "Ingen endringer å publisere."
  exit 0
fi

# Vis hva som er endret
echo "Endringer som publiseres:"
git status --short
echo ""

# Be om commit-melding
read -p "Beskriv endringen kort (f.eks. 'Ny artikkel om NATO'): " melding

if [ -z "$melding" ]; then
  melding="Oppdatering"
fi

# Commit og push
git add .
git commit -m "$melding"
git push

echo ""
echo "✅ Publisert! Netlify deployer om et øyeblikk."
echo ""
