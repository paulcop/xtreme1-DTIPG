version: '3.7'

services:
  nginx:
    image: nginx:1.22
    ports:
      - 8190:80
    volumes:
      - ./deploy/nginx/conf.d/default.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - backend  # Simple liste de services dépendants

  mysql:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: ImOxO8Lz
      MYSQL_DATABASE: xtreme1
      MYSQL_USER: xtreme1
      MYSQL_PASSWORD: Rc4K3L6f
    ports:
      - 8191:3306
    volumes:
      - mysql-data:/var/lib/mysql
      - ./deploy/mysql/custom.cnf:/etc/mysql/conf.d/custom.cnf
      - ./deploy/mysql/migration:/docker-entrypoint-initdb.d
    healthcheck:
      test: '/usr/bin/mysql --user=xtreme1 --password=Rc4K3L6f --execute "SHOW DATABASES;"'
      interval: 10s
      timeout: 10s
      start_period: 10s
      retries: 10

  redis:
    image: redis:6.2
    ports:
      - 8192:6379
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 10s
      start_period: 10s
      retries: 10

  minio:
    image: bitnami/minio:2022.9.1
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: 1tQB970y
      MINIO_DEFAULT_BUCKETS: xtreme1:download
    ports:
      - 8193:9000
      - 8194:9001
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "--silent", "-f", "http://minio:9000/minio/health/ready"]
      interval: 10s
      timeout: 10s
      start_period: 10s
      retries: 10

  backend:
    image: basicai/xtreme1-backend:v0.9.1
    ports:
      - 8290:8080
    healthcheck:
      test: ["CMD", "curl", "--silent", "-f", "http://backend:8080/actuator/health"]
      interval: 10s
      timeout: 10s
      start_period: 10s
      retries: 30
    depends_on:
      - mysql
      - redis
      - minio  # Simple liste de services dépendants

  frontend:
    image: xtreme1-frontend
    ports:
      - 8291:80

  pcd-tools:
    image: basicai/xtreme1-pcd-tools
    ports:
      - 8295:5000

  image-vect-visualization:
    image: basicai/xtreme1-image-vect-visualization
    ports:
      - 8294:5000

  image-object-detection:
    image: basicai/xtreme1-image-object-detection
    ports:
      - 8292:5000

  point-cloud-object-detection:
    image: basicai/xtreme1-point-cloud-object-detection
    ports:
      - 8293:5000

volumes:
  mysql-data:
  redis-data:
  minio-data:

