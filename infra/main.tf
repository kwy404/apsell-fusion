terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker",
      version = "~> 3.0.1"
    }
  }
}

provider "docker" {
  host = "ssh://ubuntu@162.19.222.238"
}

resource "docker_image" "database" {
  name = "postgres:18.0-alpine"
}

resource "docker_image" "service" {
  name = "dcdmsx/appsell-connection:${var.appsell_connection_version}"
}

resource "docker_volume" "database" {
  name   = "appsell-database"
  driver = "local"
}

resource "docker_container" "database" {
  name         = "appsell-database"
  image        = docker_image.database.image_id
  network_mode = "bridge"
  restart      = "unless-stopped"

  env = [
    "POSTGRES_USER=postgres",
    "POSTGRES_PASSWORD=docker",
    "POSTGRES_DB=appsell",
  ]

  volumes {
    volume_name    = docker_volume.database.name
    container_path = "/var/lib/postgresql/data"
  }

  networks_advanced {
    name = "orbit_network"
  }

  ports {
    internal = 5432
    external = 15455
  }
}

resource "docker_container" "service" {
  name         = "appsell-connection"
  image        = docker_image.service.image_id
  depends_on   = [docker_container.database]
  network_mode = "bridge"
  restart      = "unless-stopped"

  networks_advanced {
    name = "orbit_network"
  }

  ports {
    internal = 5455
    external = 5455
  }

  env = [
    "PORT=5455",
    "DATABASE_URL=postgresql://postgres:docker@appsell-database:5432/appsell",
    "RABBITMQ_URL=amqp://guest:guest@broker:5672/",
  ]
}
