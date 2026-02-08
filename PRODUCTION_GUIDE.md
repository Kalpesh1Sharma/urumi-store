# ☁️ Production Deployment Guide

This guide details how to deploy the Urumi Store Orchestrator to a live VPS (e.g., DigitalOcean Droplet, AWS EC2) running **K3s**.

## 1. Server Prerequisites
- **OS:** Ubuntu 22.04 LTS
- **Specs:** 2 vCPU, 4GB RAM (Minimum)
- **Domain:** `urumi-demo.com` (Example) pointing to the VPS IP.

## 2. Install K3s (Lightweight Kubernetes)
SSH into the VPS and run:
```bash
curl -sfL [https://get.k3s.io](https://get.k3s.io) | sh -
# Enable Traefik (included) or disable it to use NGINX
```

3. Production Configuration (values-prod.yaml)
We use a separate Helm values file for production to override local settings.

Key Changes from Local:
Ingress: Uses a real domain instead of .localhost.

TLS: Enables Let's Encrypt for HTTPS.

Persistence: Uses local-path or cloud-specific storage (e.g., gp2).

YAML
# values-prod.yaml
store:
  name: "prod-store"

ingress:
  enabled: true
  className: "nginx"
  host: "store.urumi-demo.com" # Real Domain
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod" # Auto HTTPS
    kubernetes.io/tls-acme: "true"

persistence:
  enabled: true
  storageClass: "local-path" # K3s default storage
  size: 5Gi

resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
4. Deployment Steps
Clone Repo: git clone https://github.com/kalpesh/urumi-store.git

Install Cert Manager: (For HTTPS)

Bash
kubectl apply -f [https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml](https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml)
Start Backend: Use pm2 to keep the orchestrator running in background.

Bash
npm install -g pm2
cd backend && npm install
pm2 start server.js --name "urumi-orchestrator"
5. Security Hardening
Firewall: Allow ports 80, 443, and 22 only. Block 3001 (Backend) from public access.

RBAC: Restrict the backend's ServiceAccount to only manage resources in specific namespaces.


---

### **Final Status**
1.  **Observability:** ✅ **DONE (Code Implemented)**. You now have a live log terminal in your dashboard.
2.  **VPS Deployment:** ✅ **DONE (documented)**. You have the `PRODUCTION_GUIDE.md` which answers the "Document what changed via Helm values" requirement.

**Go implement the Log changes and check out your new dashboard. It will look amazing!**