# Meeshy Project - Copilot Configuration

## Project Overview
Meeshy is a high-performance real-time multilingual messaging platform built with modern technologies and enterprise-grade architecture.

## Current Architecture
- **Frontend**: Next.js 15 + React 19 + TypeScript 5.8 + Tailwind CSS 3.4
- **Gateway**: Fastify 5.1 + WebSocket + gRPC + ZeroMQ + JWT
- **Translator**: FastAPI + PyTorch 2.0+ + Transformers 4.35+ + ML quantization
- **Database**: PostgreSQL 15 + Prisma 6.13 ORM
- **Cache**: Redis 7
- **Communication**: gRPC + Protocol Buffers + ZeroMQ + Socket.IO

## Key Technologies & Versions
- **Node.js**: 22+
- **Python**: 3.12+
- **Next.js**: 15.3.5
- **React**: 19.0.0
- **TypeScript**: 5.8.3
- **Fastify**: 5.1.0
- **FastAPI**: 0.104.1+
- **PyTorch**: 2.0.0+
- **Transformers**: 4.35.0+
- **PostgreSQL**: 15
- **Redis**: 7
- **Prisma**: 6.13.0

## Performance Targets
- Translation throughput: 50+ concurrent translations
- Translation latency: <100ms end-to-end
- WebSocket connections: 100k+ simultaneous
- Cache hit ratio: >85%
- Database queries: <5ms average

## Development Guidelines

### Code Style
- Use TypeScript for all JavaScript/Node.js code
- Follow Python PEP 8 for Python code
- Use async/await for asynchronous operations
- Implement proper error handling and logging
- Use structured logging with Winston (Node.js) and Loguru (Python)

### Architecture Patterns
- Microservices architecture with clear service boundaries
- Event-driven communication with ZeroMQ
- RESTful APIs with FastAPI and Fastify
- Real-time communication with WebSocket/Socket.IO
- Type-safe database operations with Prisma

### Testing Strategy
- Unit tests for all services (Jest for Node.js, pytest for Python)
- Integration tests for service communication
- End-to-end tests for complete workflows
- Performance testing for translation services

### Security Considerations
- JWT-based authentication
- Role-based access control (USER, ADMIN, MODO, AUDIT, ANALYST, BIGBOSS)
- Input validation with Zod (TypeScript) and Pydantic (Python)
- CORS configuration for cross-origin requests
- Rate limiting and security headers

### Performance Optimization
- Model quantization (float16, float32) for ML models
- Worker pools for concurrent translation processing
- Redis caching for translations and sessions
- Database connection pooling
- Optimized database queries with Prisma

## File Structure
```
meeshy/
├── frontend/          # Next.js 15 + React 19 + TypeScript
├── gateway/           # Fastify 5.1 + WebSocket + gRPC
├── translator/        # FastAPI + PyTorch + Transformers
├── shared/            # Prisma Schema + Proto files
├── docker/            # Nginx Configuration
├── scripts/           # Automated CI/CD pipeline
├── docker-compose.yml # Microservices setup
└── docker-compose.unified.yml # All-in-one setup
```

## Environment Configuration
- Use environment variables for configuration
- Support for development, staging, and production environments
- Docker-based deployment with multi-platform builds
- Automated version management

## Current Focus Areas
- High-performance real-time messaging
- Multilingual translation with ML models
- Scalable microservices architecture
- Automated testing and deployment
- Enterprise-grade security and monitoring

## Development Workflow
- Automated CI/CD pipeline with version management
- Comprehensive testing strategy
- Docker-based development and deployment
- Multi-platform build support (linux/amd64, linux/arm64)

## Important Notes
- Always consider performance implications when adding features
- Maintain backward compatibility when possible
- Follow semantic versioning for releases
- Document API changes and new features
- Test thoroughly before deployment
