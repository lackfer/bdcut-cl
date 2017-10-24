/**
*   Script para generación automática de archivos sql
*   ## Modo de uso
* 
*  node index.js rutaAlArchivoConFormato [rutaOutput] [rutaCSV]
* 
*  Ejemplo: node index.js formatos/postgres.json postgres.sql
*/
const fs = require('fs')
const path = require('path')
const readline = require('readline')

let header_text_pre="**********************************************************\n"+
		"Este archivo contiene el Script de creación de la base de\n"+
		"datos de los códigos territoriales para Chile \n"+
		"SE HA GENERADO AUTOMATICAMENTE a partir de un archivo CSV\n"+
		"Revise la documentación para más detalle\n"+
		"Dirección del proyecto en GitHub:\n"+
		"		https://github.com/knxroot/BDCUT_CL\n"
let header_text_post="************************************************************"

let formatPath = process.argv[2]

if (!formatPath) {
    console.log('Faltó especificar la ruta del archivo con el formato')
    process.exit(-1)
}

if (!fs.existsSync(formatPath)) {
    console.log('El archivo con el formato no existe')
    process.exit(-2)
}

let outputPath = process.argv[3] || 'output.txt'
let csvPath = path.resolve(__dirname, '../BD/CSV_utf8/BDCUT_CL__CSV_UTF8.csv' || process.argv[4])

new Promise(resolve => {

    console.log('Leyendo archivo CSV...')

    let inputStream = fs.createReadStream(csvPath)
    let lineReader = readline.createInterface({
        input: inputStream
    })
    let container = {
        regiones: {},
        provincias: {},
        comunas: {}
    }
    let header = true

    lineReader.on('line', function (line) {

        if (header) {
            header = false
            return
        }

        let [comunaName, comunaId, provinciaName, provinciaId, regionName, regionId] = line.split(',')
        let { regiones, provincias, comunas } = container

        if (!regiones[regionId]) {
            regiones[regionId] = {
                id: regionId,
                name: regionName
            }
        }

        if (!provincias[provinciaId]) {
            provincias[provinciaId] = {
                id: provinciaId,
                name: provinciaName,
                regionId,
                regionName
            }
        }

        comunas[comunaId] = {
            id: comunaId,
            name: comunaName,
            provinciaId,
            provinciaName,
            regionId,
            regionName
        }

    })

    inputStream.on('end', () => {
        lineReader.close()
        inputStream.close()
        console.log('Archivo CSV leído con éxito...')
        resolve(container)
    })

}).then(container => {

    console.log('Creando archivo a partir del formato...')

    let format = require(path.resolve(__dirname, formatPath))
    let outputStream = fs.createWriteStream(outputPath)
    let separator = format.separator ? format.separator : '\n'
    let replaceVariableRegex = /\$\{(.*?)\}/g
    let replaceInfoRegex = /\$\{_(.*?)\}/g

    let replaceWith = (string, variables, replaceRegex) => string.replace(replaceRegex, (match, variable) => variables[variable])
    let replaceWithVariables = string => replaceWith(string, format.variables, replaceVariableRegex)  
    
    let writeArray = array => {
        if (array) {
            array.forEach(v => {
                outputStream.write(replaceWithVariables(v) + '\n', 'utf8')
            })
        }
    }
    let replaceWithInfo = null

    if (format.escape) {
        let escapeRegex = new RegExp(Object.keys(format.escape).join('|'), 'g')
        let escape = string => string.replace(escapeRegex, key => format.escape[key])
        replaceWithInfo = (string, info) => {
            info = Object.assign({}, info)
            info.name = escape(info.name)
            return replaceWith(string, info, replaceInfoRegex)
        }
    } else {
        replaceWithInfo = (string, info) => replaceWith(string, info, replaceInfoRegex)
    }

     if (format.mostrar_comentarios == "yes"){
	    outputStream.write(format.comentarios_var_header, 'utf8')
	    outputStream.write(header_text_pre+'\n', 'utf8')
	    writeArray(format.comentarios)
	    outputStream.write(header_text_post, 'utf8')
	    outputStream.write(format.comentarios_var_post+'\n', 'utf8')
	 }
    
    writeArray(format.pre)

    for (let division of ['regiones', 'provincias', 'comunas']) {

        writeArray(format['pre-' + division])

        if (format[division]) {

            let ids = Object.keys(container[division])
            let last = ids.length - 1
            let i = 0

            for (let id of ids) {
                outputStream.write(replaceWithVariables(replaceWithInfo(format[division], container[division][id])) + (i++ !== last ? separator : ''), 'utf8')
            }
        }
    }

    writeArray(format.post)

    outputStream.end(null, () => {
        outputStream.close()
        console.log('Archivo creado con éxito :)')
    })

})
