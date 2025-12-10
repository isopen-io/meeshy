# Phase 1B: Deployment Guide

## Table of Contents
1. [Overview](#overview)
2. [Infrastructure Requirements](#infrastructure-requirements)
3. [Docker Configuration](#docker-configuration)
4. [Docker Compose (Development)](#docker-compose-development)
5. [Kubernetes Deployment (Production)](#kubernetes-deployment-production)
6. [Monitoring & Logging](#monitoring--logging)
7. [Scaling Strategy](#scaling-strategy)
8. [Operational Runbook](#operational-runbook)

---

## Overview

This guide covers deployment of the Media Server and Gateway updates for Phase 1B. Deployment options:

1. **Development**: Docker Compose (local machine)
2. **Staging**: Kubernetes (single cluster)
3. **Production**: Kubernetes (multi-region, auto-scaling)

### Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Load Balancer Layer"
            LB[Load Balancer<br/>AWS ALB / Cloudflare]
        end

        subgraph "Application Layer"
            GW1[Gateway Pod 1]
            GW2[Gateway Pod 2]
            GW3[Gateway Pod 3]
            MS1[Media Server Pod 1]
            MS2[Media Server Pod 2]
            MS3[Media Server Pod 3]
        end

        subgraph "Data Layer"
            Redis[(Redis Cluster)]
            MongoDB[(MongoDB Replica Set)]
        end

        subgraph "Infrastructure Services"
            TURN1[TURN Server 1<br/>US-East]
            TURN2[TURN Server 2<br/>EU-West]
            TURN3[TURN Server 3<br/>Asia-Pacific]
        end
    end

    LB --> GW1
    LB --> GW2
    LB --> GW3

    GW1 --> MS1
    GW1 --> MS2
    GW1 --> MS3
    GW2 --> MS1
    GW2 --> MS2
    GW2 --> MS3
    GW3 --> MS1
    GW3 --> MS2
    GW3 --> MS3

    GW1 --> Redis
    GW2 --> Redis
    GW3 --> Redis

    GW1 --> MongoDB
    GW2 --> MongoDB
    GW3 --> MongoDB

    MS1 --> TURN1
    MS2 --> TURN2
    MS3 --> TURN3

    style MS1 fill:#FF6B6B
    style MS2 fill:#FF6B6B
    style MS3 fill:#FF6B6B
    style GW1 fill:#4A90E2
    style GW2 fill:#4A90E2
    style GW3 fill:#4A90E2
```

---

## Infrastructure Requirements

### Media Server (Per Instance)

| Resource | Requirement | Justification |
|----------|-------------|---------------|
| **CPU** | 4-8 cores (2.5+ GHz) | mediasoup is CPU-intensive (RTP routing) |
| **RAM** | 8-16 GB | ~60 MB per participant + OS overhead |
| **Storage** | 50 GB SSD | Logs, recordings (temporary) |
| **Network** | 1 Gbps NIC | 50 participants × 20 Mbps = 1 Gbps |
| **Ports** | 10000-10100 (UDP) | RTP/RTCP ports for WebRTC |
| **Ports** | 3001 (TCP) | HTTP API + WebSocket |

**Recommended Instances**:
- **AWS**: c6i.2xlarge (8 vCPU, 16 GB RAM)
- **GCP**: c2-standard-8 (8 vCPU, 32 GB RAM)
- **DigitalOcean**: CPU-Optimized 8 vCPU / 16 GB

### Gateway (Per Instance)

| Resource | Requirement |
|----------|-------------|
| **CPU** | 2-4 cores |
| **RAM** | 4-8 GB |
| **Storage** | 20 GB SSD |
| **Network** | 1 Gbps NIC |
| **Ports** | 4000 (TCP) for HTTP/WebSocket |

**Recommended Instances**:
- **AWS**: t3.large (2 vCPU, 8 GB RAM)
- **GCP**: n2-standard-2 (2 vCPU, 8 GB RAM)

### TURN Server (Per Region)

| Resource | Requirement |
|----------|-------------|
| **CPU** | 2-4 cores |
| **RAM** | 4 GB |
| **Storage** | 20 GB SSD |
| **Network** | 1 Gbps NIC (high bandwidth!) |
| **Ports** | 3478 (UDP/TCP), 5349 (TLS) |
| **Public IP** | Required |

**Recommended Software**: Coturn (open-source)

---

## Docker Configuration

### Media Server Dockerfile

**File**: `media-server/Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

# Install build dependencies for mediasoup
RUN apk add --no-cache python3 make g++ gcc linux-headers

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

# Install runtime dependencies for mediasoup
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built code from builder
COPY --from=builder /app/dist ./dist

# Copy DTLS certificates
COPY certs/ ./certs/

# Create non-root user
RUN addgroup -g 1001 -S mediaserver && \
    adduser -S mediaserver -u 1001
USER mediaserver

# Expose ports
EXPOSE 3001
EXPOSE 10000-10100/udp

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "dist/server.js"]
```

### Build & Run Locally

```bash
# Build image
docker build -t meeshy/media-server:latest ./media-server

# Run container
docker run -d \
  --name media-server \
  -p 3001:3001 \
  -p 10000-10100:10000-10100/udp \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret \
  -e LOG_LEVEL=info \
  meeshy/media-server:latest

# View logs
docker logs -f media-server

# Stop container
docker stop media-server
```

---

## Docker Compose (Development)

**File**: `docker-compose.yml` (root of repo)

```yaml
version: '3.8'

services:
  # MongoDB
  mongodb:
    image: mongo:7
    container_name: meeshy-mongodb
    restart: unless-stopped
    ports:
      - '27017:27017'
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db
    networks:
      - meeshy-network

  # Redis
  redis:
    image: redis:7-alpine
    container_name: meeshy-redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    networks:
      - meeshy-network

  # Gateway Service
  gateway:
    build:
      context: ./gateway
      dockerfile: Dockerfile
    container_name: meeshy-gateway
    restart: unless-stopped
    ports:
      - '4000:4000'
    environment:
      NODE_ENV: development
      PORT: 4000
      DATABASE_URL: mongodb://admin:password@mongodb:27017/meeshy?authSource=admin
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-secret-change-in-production
      MEDIA_SERVER_URL: http://media-server:3001
      FRONTEND_URL: http://localhost:3000
    depends_on:
      - mongodb
      - redis
      - media-server
    networks:
      - meeshy-network
    volumes:
      - ./gateway/src:/app/src  # Hot reload for development

  # Media Server
  media-server:
    build:
      context: ./media-server
      dockerfile: Dockerfile
    container_name: meeshy-media-server
    restart: unless-stopped
    ports:
      - '3001:3001'
      - '10000-10100:10000-10100/udp'
    environment:
      NODE_ENV: development
      PORT: 3001
      JWT_SECRET: dev-secret-change-in-production
      LOG_LEVEL: debug
      RTC_MIN_PORT: 10000
      RTC_MAX_PORT: 10100
      ANNOUNCED_IP: 127.0.0.1  # Change to public IP for remote access
    networks:
      - meeshy-network
    volumes:
      - ./media-server/src:/app/src  # Hot reload for development

  # Frontend (Next.js)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: meeshy-frontend
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_GATEWAY_URL: http://localhost:4000
      NEXT_PUBLIC_MEDIA_SERVER_URL: http://localhost:3001
    depends_on:
      - gateway
    networks:
      - meeshy-network

  # TURN Server (Coturn)
  coturn:
    image: coturn/coturn:latest
    container_name: meeshy-coturn
    restart: unless-stopped
    ports:
      - '3478:3478/udp'
      - '3478:3478/tcp'
      - '5349:5349/tcp'  # TLS
    environment:
      DETECT_EXTERNAL_IP: 'yes'
      DETECT_RELAY_IP: 'yes'
      REALM: meeshy.com
      USERNAME: meeshy
      PASSWORD: change-me-in-production
    networks:
      - meeshy-network

volumes:
  mongodb_data:
  redis_data:

networks:
  meeshy-network:
    driver: bridge
```

### Start Development Environment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f media-server

# Stop all services
docker-compose down

# Rebuild and restart specific service
docker-compose up -d --build media-server
```

---

## Kubernetes Deployment (Production)

### Namespace

**File**: `k8s/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: meeshy-video-calls
  labels:
    app: meeshy
```

### Media Server Deployment

**File**: `k8s/media-server-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: media-server
  namespace: meeshy-video-calls
  labels:
    app: media-server
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: media-server
  template:
    metadata:
      labels:
        app: media-server
        version: v1
    spec:
      containers:
      - name: media-server
        image: meeshy/media-server:1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 3001
          name: http
          protocol: TCP
        - containerPort: 10000
          name: rtp-start
          protocol: UDP
        - containerPort: 10100
          name: rtp-end
          protocol: UDP
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3001"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: media-server-secrets
              key: jwt-secret
        - name: LOG_LEVEL
          value: "info"
        - name: RTC_MIN_PORT
          value: "10000"
        - name: RTC_MAX_PORT
          value: "10100"
        - name: ANNOUNCED_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
        resources:
          requests:
            cpu: 2000m
            memory: 4Gi
          limits:
            cpu: 4000m
            memory: 8Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - media-server
              topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: media-server
  namespace: meeshy-video-calls
spec:
  type: NodePort  # Or LoadBalancer for direct access
  ports:
  - port: 3001
    targetPort: 3001
    protocol: TCP
    name: http
  - port: 10000
    targetPort: 10000
    protocol: UDP
    name: rtp
  selector:
    app: media-server
```

### Horizontal Pod Autoscaler

**File**: `k8s/media-server-hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: media-server-hpa
  namespace: meeshy-video-calls
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: media-server
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 min before scaling down
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0  # Scale up immediately
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 2
        periodSeconds: 15
      selectPolicy: Max
```

### ConfigMap & Secrets

**File**: `k8s/media-server-configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: media-server-config
  namespace: meeshy-video-calls
data:
  mediasoup-config.json: |
    {
      "worker": {
        "logLevel": "warn",
        "rtcMinPort": 10000,
        "rtcMaxPort": 10100
      },
      "router": {
        "mediaCodecs": [
          {
            "kind": "audio",
            "mimeType": "audio/opus",
            "clockRate": 48000,
            "channels": 2
          },
          {
            "kind": "video",
            "mimeType": "video/VP8",
            "clockRate": 90000
          }
        ]
      }
    }
---
apiVersion: v1
kind: Secret
metadata:
  name: media-server-secrets
  namespace: meeshy-video-calls
type: Opaque
data:
  jwt-secret: <base64-encoded-secret>  # echo -n "your-secret" | base64
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl apply -f k8s/media-server-configmap.yaml

# Deploy Media Server
kubectl apply -f k8s/media-server-deployment.yaml

# Deploy HPA
kubectl apply -f k8s/media-server-hpa.yaml

# Verify deployment
kubectl get pods -n meeshy-video-calls
kubectl get hpa -n meeshy-video-calls

# View logs
kubectl logs -f deployment/media-server -n meeshy-video-calls

# Port-forward for testing
kubectl port-forward -n meeshy-video-calls svc/media-server 3001:3001
```

---

## Monitoring & Logging

### Prometheus Metrics

**Endpoint**: `http://media-server:3001/metrics`

**Key Metrics**:

```
# Media Server metrics
mediasoup_workers_total                # Number of Workers
mediasoup_routers_total                # Number of Routers (active calls)
mediasoup_transports_total             # Total Transports
mediasoup_producers_total              # Total Producers
mediasoup_consumers_total              # Total Consumers

# Call metrics
calls_active_total                     # Active calls
calls_mode_p2p_total                   # Calls in P2P mode
calls_mode_sfu_total                   # Calls in SFU mode
calls_mode_transitions_total           # Mode transitions count

# Performance metrics
call_mode_transition_duration_seconds  # Histogram of transition durations
webrtc_transport_connection_duration_seconds
producer_creation_duration_seconds
consumer_creation_duration_seconds

# System metrics
process_cpu_seconds_total
process_resident_memory_bytes
nodejs_heap_size_total_bytes
```

### Prometheus ServiceMonitor

**File**: `k8s/media-server-servicemonitor.yaml`

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: media-server
  namespace: meeshy-video-calls
  labels:
    app: media-server
spec:
  selector:
    matchLabels:
      app: media-server
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

### Grafana Dashboard

**Import Dashboard**: [mediasoup-dashboard.json](https://grafana.com/grafana/dashboards/mediasoup)

**Key Panels**:
- Active Calls (gauge)
- Participants per Call (bar chart)
- Mode Transition Duration (histogram)
- CPU/RAM Usage (line chart)
- Packet Loss Distribution (heatmap)

---

## Scaling Strategy

### Vertical Scaling (Scale Up)

**When**: Single Media Server instance hits resource limits

**Action**:
```yaml
resources:
  requests:
    cpu: 4000m      # Increase from 2000m
    memory: 8Gi     # Increase from 4Gi
  limits:
    cpu: 8000m
    memory: 16Gi
```

**Max Recommended**: 16 vCPU, 32 GB RAM (diminishing returns beyond this)

---

### Horizontal Scaling (Scale Out)

**When**: Multiple concurrent calls exceed single server capacity

**Auto-Scaling**:
- Kubernetes HPA scales based on CPU/RAM usage
- Scales up when CPU >70% or RAM >80%
- Scales down when CPU <30% for 5 minutes

**Manual Scaling**:
```bash
# Scale to 5 replicas
kubectl scale deployment/media-server --replicas=5 -n meeshy-video-calls
```

---

### Load Balancing Strategy

**Gateway-Side Load Balancing**:

```typescript
// Gateway tracks Media Server capacity
class MediaServerLoadBalancer {
  private servers: MediaServer[] = [
    { url: 'http://media-server-1:3001', activeCalls: 0, maxCalls: 10 },
    { url: 'http://media-server-2:3001', activeCalls: 0, maxCalls: 10 },
    { url: 'http://media-server-3:3001', activeCalls: 0, maxCalls: 10 },
  ];

  getLeastLoadedServer(): MediaServer {
    return this.servers.sort((a, b) => a.activeCalls - b.activeCalls)[0];
  }

  async createRoom(callId: string): Promise<string> {
    const server = this.getLeastLoadedServer();

    if (server.activeCalls >= server.maxCalls) {
      throw new Error('All Media Servers at capacity');
    }

    const roomId = await this.mediaServerClient.createRoom(callId, server.url);
    server.activeCalls++;

    return roomId;
  }
}
```

---

## Operational Runbook

### Common Operations

#### 1. Deploy New Version

```bash
# Build and tag new image
docker build -t meeshy/media-server:1.1.0 ./media-server
docker push meeshy/media-server:1.1.0

# Update deployment
kubectl set image deployment/media-server \
  media-server=meeshy/media-server:1.1.0 \
  -n meeshy-video-calls

# Monitor rollout
kubectl rollout status deployment/media-server -n meeshy-video-calls

# Rollback if issues
kubectl rollout undo deployment/media-server -n meeshy-video-calls
```

---

#### 2. Restart Media Server

```bash
# Graceful restart (one pod at a time)
kubectl rollout restart deployment/media-server -n meeshy-video-calls

# Force restart (all pods)
kubectl delete pods -l app=media-server -n meeshy-video-calls
```

---

#### 3. Scale for Peak Traffic

```bash
# Before peak hours (e.g., 5pm weekdays)
kubectl scale deployment/media-server --replicas=8 -n meeshy-video-calls

# After peak hours (e.g., midnight)
kubectl scale deployment/media-server --replicas=3 -n meeshy-video-calls
```

---

#### 4. Investigate High CPU Usage

```bash
# Check current resource usage
kubectl top pods -n meeshy-video-calls -l app=media-server

# Get detailed metrics from pod
kubectl exec -it media-server-<pod-id> -n meeshy-video-calls -- \
  curl localhost:3001/metrics | grep cpu

# Check active calls
curl http://media-server:3001/api/stats
```

---

#### 5. Debug Connection Issues

```bash
# Check pod logs for errors
kubectl logs -f media-server-<pod-id> -n meeshy-video-calls | grep ERROR

# Test connectivity from Gateway pod
kubectl exec -it gateway-<pod-id> -n meeshy-video-calls -- \
  curl http://media-server:3001/health

# Check network policies
kubectl get networkpolicies -n meeshy-video-calls
```

---

#### 6. Backup & Restore

**Database Backup** (CallSession data):
```bash
# Backup MongoDB
mongodump --uri="mongodb://admin:pass@mongodb:27017/meeshy" \
  --out=/backup/meeshy-$(date +%Y%m%d)

# Restore MongoDB
mongorestore --uri="mongodb://admin:pass@mongodb:27017/meeshy" \
  /backup/meeshy-20251028
```

**Note**: Media Server state is ephemeral (no persistent data)

---

### Incident Response

#### Incident: All Media Servers Down

**Symptoms**:
- New SFU calls fail
- Existing SFU calls drop
- Gateway logs: "Failed to connect to Media Server"

**Response**:
1. Check Kubernetes pod status:
   ```bash
   kubectl get pods -n meeshy-video-calls -l app=media-server
   ```

2. View pod events:
   ```bash
   kubectl describe pod media-server-<pod-id> -n meeshy-video-calls
   ```

3. Check logs for crash reason:
   ```bash
   kubectl logs media-server-<pod-id> -n meeshy-video-calls --previous
   ```

4. Rollback to previous version:
   ```bash
   kubectl rollout undo deployment/media-server -n meeshy-video-calls
   ```

5. Notify users (status page)

---

#### Incident: High Packet Loss (>10%)

**Symptoms**:
- User reports: Video freezing, choppy audio
- Metrics: `packet_loss_percentage` >10%

**Response**:
1. Check network bandwidth:
   ```bash
   kubectl exec -it media-server-<pod-id> -- \
     iftop -i eth0
   ```

2. Check if server CPU is bottleneck:
   ```bash
   kubectl top pod media-server-<pod-id>
   ```

3. Reduce video quality (temporary):
   ```typescript
   // Force lower bitrate
   producer.setMaxSpatialLayer(0);  // Lowest quality layer
   ```

4. Scale up Media Servers:
   ```bash
   kubectl scale deployment/media-server --replicas=6
   ```

5. Investigate long-term solution (better servers, regional deployment)

---

## Security Checklist

### Pre-Production

- [ ] Change all default passwords (database, JWT secret, TURN credentials)
- [ ] Use TLS certificates (HTTPS/WSS, not HTTP/WS)
- [ ] Enable rate limiting on all APIs
- [ ] Configure firewall rules (restrict RTP ports to known IPs)
- [ ] Disable unnecessary logs (PII, sensitive data)
- [ ] Run security audit (`npm audit`, Docker image scan)
- [ ] Setup DDoS protection (Cloudflare, AWS Shield)
- [ ] Implement network policies (Kubernetes)
- [ ] Enable pod security policies
- [ ] Configure RBAC for Kubernetes access

### Post-Deployment

- [ ] Monitor for unusual traffic patterns
- [ ] Review logs for failed authentication attempts
- [ ] Setup automated security updates
- [ ] Schedule penetration testing
- [ ] Review and rotate secrets quarterly

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Microservices Architect (Claude)
**Status**: Final for Review
