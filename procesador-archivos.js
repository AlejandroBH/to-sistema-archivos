const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { Transform } = require("stream");

class ProcesadorArchivos {
  constructor(directorioBase = "./archivos") {
    this.directorioBase = directorioBase;
  }

  // Crear estructura de directorios
  async inicializar() {
    try {
      await fs.mkdir(this.directorioBase, { recursive: true });
      await fs.mkdir(path.join(this.directorioBase, "procesados"), {
        recursive: true,
      });
      await fs.mkdir(path.join(this.directorioBase, "errores"), {
        recursive: true,
      });
      console.log("✅ Estructura de directorios creada");
    } catch (error) {
      console.error("❌ Error creando estructura:", error.message);
    }
  }

  // Procesar archivo de texto (contar palabras)
  async procesarArchivoTexto(rutaArchivo) {
    try {
      const contenido = await fs.readFile(rutaArchivo, "utf8");
      const estadisticas = {
        palabras: contenido.split(/\s+/).filter((p) => p.length > 0).length,
        caracteres: contenido.length,
        lineas: contenido.split("\n").length,
        ruta: rutaArchivo,
      };

      // Guardar estadísticas
      const nombreBase = path.basename(rutaArchivo, path.extname(rutaArchivo));
      const rutaEstadisticas = path.join(
        this.directorioBase,
        "procesados",
        `${nombreBase}-stats.json`
      );
      await fs.writeFile(
        rutaEstadisticas,
        JSON.stringify(estadisticas, null, 2)
      );

      console.log(
        `✅ Archivo ${nombreBase} procesado: ${estadisticas.palabras} palabras`
      );
      return estadisticas;
    } catch (error) {
      await this.moverAErrores(rutaArchivo, error.message);
      throw error;
    }
  }

  // Convertir archivo a mayúsculas usando streams
  convertirAMayusculas(rutaEntrada, rutaSalida) {
    return new Promise((resolve, reject) => {
      const transformStream = new Transform({
        transform(chunk, encoding, callback) {
          const mayusculas = chunk.toString().toUpperCase();
          this.push(mayusculas);
          callback();
        },
      });

      const readable = fsSync.createReadStream(rutaEntrada, {
        encoding: "utf8",
      });
      const writable = fsSync.createWriteStream(rutaSalida);

      readable.pipe(transformStream).pipe(writable);

      writable.on("finish", () => {
        console.log(`✅ Archivo convertido a mayúsculas: ${rutaSalida}`);
        resolve(rutaSalida);
      });

      writable.on("error", reject);
      readable.on("error", reject);
    });
  }

  // Copiar archivo usando streams
  copiarArchivoStreams(rutaOrigen, rutaDestino) {
    return new Promise((resolve, reject) => {
      const readable = fsSync.createReadStream(rutaOrigen);
      const writable = fsSync.createWriteStream(rutaDestino);

      readable.pipe(writable);

      writable.on("finish", () => {
        console.log(`✅ Archivo copiado: ${rutaDestino}`);
        resolve(rutaDestino);
      });

      writable.on("error", reject);
      readable.on("error", reject);
    });
  }

  // Mover archivo a carpeta de errores
  async moverAErrores(rutaArchivo, mensajeError) {
    try {
      const nombreArchivo = path.basename(rutaArchivo);
      const rutaError = path.join(
        this.directorioBase,
        "errores",
        nombreArchivo
      );

      await fs.rename(rutaArchivo, rutaError);

      // Crear archivo de error
      const rutaLogError = path.join(
        this.directorioBase,
        "errores",
        `${nombreArchivo}.error.log`
      );
      await fs.writeFile(
        rutaLogError,
        `Error: ${mensajeError}\nFecha: ${new Date().toISOString()}`
      );

      console.log(`📁 Archivo movido a errores: ${nombreArchivo}`);
    } catch (error) {
      console.error("❌ Error moviendo archivo a errores:", error.message);
    }
  }

  // Procesar directorio completo
  async procesarDirectorio(rutaDirectorio) {
    try {
      const archivos = await fs.readdir(rutaDirectorio);
      const archivosTxt = archivos.filter(
        (archivo) => archivo.endsWith(".txt") || archivo.endsWith(".md")
      );

      console.log(`📂 Procesando ${archivosTxt.length} archivos de texto...`);

      const resultados = [];
      for (const archivo of archivosTxt) {
        const rutaCompleta = path.join(rutaDirectorio, archivo);
        try {
          const resultado = await this.procesarArchivoTexto(rutaCompleta);
          resultados.push(resultado);
        } catch (error) {
          console.error(`❌ Error procesando ${archivo}:`, error.message);
        }
      }

      return resultados;
    } catch (error) {
      console.error("❌ Error procesando directorio:", error.message);
      throw error;
    }
  }

  // Crear directorio de backup con fecha y hora
  async crearDirectorioBackup() {
    const fecha = new Date();
    const fechaFormateada = fecha.toLocaleDateString("es-CL", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const nombreDirectorio = `backup-${fechaFormateada} (${fecha.getHours()} ${fecha.getMinutes()})`;

    this.rutaBackup = path.join(
      this.directorioBase,
      "backups",
      nombreDirectorio
    );

    await fs.mkdir(this.rutaBackup, { recursive: true });
    console.log(`📁 Directorio de Backup creado: ${this.rutaBackup}`);

    return this.rutaBackup;
  }

  async ejecutarBackup(rutasArchivos) {
    if (!this.rutaBackup) {
      await this.crearDirectorioBackup();
    }

    console.log(`⏳ Iniciando backup de ${rutasArchivos.length} archivos...`);

    const promesasCopia = rutasArchivos.map(async (rutaOrigen) => {
      const nombreArchivo = path.basename(rutaOrigen);
      const rutaDestino = path.join(this.rutaBackup, nombreArchivo);
      try {
        return await this.copiarArchivoStreams(rutaOrigen, rutaDestino);
      } catch (error) {
        console.error(`❌ Error copiando ${nombreArchivo}:`, error.message);
        throw new Error(`Fallo en el backup de ${nombreArchivo}`);
      }
    });

    try {
      await Promise.all(promesasCopia);
      console.log("🎉 Backup completado exitosamente.");
    } catch (error) {
      console.error("🛑 Backup finalizado con errores:", error.message);
    }
  }

  // Generar reporte consolidado
  async generarReporte(resultados) {
    const reporte = {
      fechaGeneracion: new Date().toISOString(),
      totalArchivos: resultados.length,
      estadisticasGlobales: {
        totalPalabras: resultados.reduce((sum, r) => sum + r.palabras, 0),
        totalCaracteres: resultados.reduce((sum, r) => sum + r.caracteres, 0),
        promedioPalabras: Math.round(
          resultados.reduce((sum, r) => sum + r.palabras, 0) / resultados.length
        ),
        archivosProcesados: resultados.length,
      },
      detalleArchivos: resultados,
    };

    const rutaReporte = path.join(
      this.directorioBase,
      "reporte-procesamiento.json"
    );
    await fs.writeFile(rutaReporte, JSON.stringify(reporte, null, 2));

    console.log("📊 Reporte generado:", rutaReporte);
    return reporte;
  }
}

async function ejecutarCLI() {
  const procesador = new ProcesadorArchivos("./demo-cli");
  const args = process.argv.slice(2);
  const comando = args[0];
  const archivo = {
    nombre: args[1],
    contenido: args[2],
  };

  console.log(`\n⚙️ Ejecutando comando: ${comando.toUpperCase()}...`);

  try {
    await procesador.inicializar();

    switch (comando) {
      case "inicializar":
        break;

      case "procesar":
        console.log("\n⚙️ Procesando archivos...");
        await procesador.procesarDirectorio("./demo-cli");
        break;

      case "crear":
        const ruta = path.join("./demo-cli", archivo.nombre);
        await fs.writeFile(ruta, archivo.contenido);
        console.log(`✅ Creado: ${archivo.nombre}`);
        break;

      default:
        console.error(`❌ Comando no reconocido: ${comando}`);
        break;
    }
  } catch (error) {
    console.error("🛑 Error en la ejecución del comando:", error.message);
    process.exit(1);
  }
}

ejecutarCLI();

// Demostración del sistema completo
async function demostrarSistemaArchivos() {
  const procesador = new ProcesadorArchivos("./demo-archivos");
  console.log("🚀 DEMOSTRACIÓN: SISTEMA DE PROCESAMIENTO DE ARCHIVOS\n");

  // 1. Inicializar estructura
  console.log("🏗️ Inicializando estructura...");
  await procesador.inicializar();

  // 2. Crear archivos de ejemplo
  console.log("\n📝 Creando archivos de ejemplo...");
  const archivosEjemplo = [
    {
      nombre: "documento1.txt",
      contenido:
        "Este es un documento de ejemplo con varias palabras para procesar.",
    },
    {
      nombre: "documento2.txt",
      contenido:
        "Otro documento más largo con más contenido y más palabras para el análisis.",
    },
    {
      nombre: "notas.md",
      contenido:
        "# Notas Importantes\n\n- Aprender Node.js\n- Practicar streams\n- Dominar el sistema de archivos",
    },
  ];

  for (const archivo of archivosEjemplo) {
    const ruta = path.join("./demo-archivos", archivo.nombre);
    await fs.writeFile(ruta, archivo.contenido);
    console.log(`✅ Creado: ${archivo.nombre}`);
  }

  // 3. Procesar archivos
  console.log("\n⚙️ Procesando archivos...");
  const resultados = await procesador.procesarDirectorio("./demo-archivos");

  // 4. Convertir archivo a mayúsculas
  console.log("\n🔄 Convirtiendo archivo a mayúsculas...");
  await procesador.convertirAMayusculas(
    "./demo-archivos/documento1.txt",
    "./demo-archivos/documento1-mayusculas.txt"
  );

  // 5. Copiar archivo usando streams
  console.log("\n📋 Copiando archivo con streams...");
  await procesador.copiarArchivoStreams(
    "./demo-archivos/notas.md",
    "./demo-archivos/copia-notas.md"
  );

  // 6. Ejecutar Backup
  console.log("\n🛡️ Realizando Copia de Seguridad...");
  const archivosParaBackup = [
    "./demo-archivos/documento1.txt",
    "./demo-archivos/documento2.txt",
    "./demo-archivos/notas.md",
    "./demo-archivos/documento1-mayusculas.txt",
  ];
  await procesador.ejecutarBackup(archivosParaBackup);

  // 7. Generar reporte
  console.log("\n📊 Generando reporte...");
  const reporte = await procesador.generarReporte(resultados);

  console.log("\n📈 ESTADÍSTICAS FINALES:");
  console.log(
    `- Archivos procesados: ${reporte.estadisticasGlobales.archivosProcesados}`
  );
  console.log(
    `- Total palabras: ${reporte.estadisticasGlobales.totalPalabras}`
  );
  console.log(
    `- Promedio palabras: ${reporte.estadisticasGlobales.promedioPalabras}`
  );

  console.log("\n🎯 Sistema de archivos completado exitosamente!");
}

// Ejecutar demostración
demostrarSistemaArchivos().catch((error) => {
  console.error("❌ Error en la demostración:", error.message);
});
