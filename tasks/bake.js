/*
 * grunt-bake
 * https://github.com/MathiasPaumgarten/grunt-bake
 *
 * Copyright (c) 2013 Mathias Paumgarten
 * Licensed under the MIT license.
 */

"use strict";

var mout = require( "mout" );

module.exports = function( grunt ) {

	grunt.registerMultiTask( "bake", "Bake templates into a file.", function() {

		// =============
		// -- OPTIONS --
		// =============

		// Merging the passed options with the default settingss

		var options = this.options( {
			content: null,
			section: null,
			basePath: "",
			parsePattern: /\{\{\s*([\.\-\w]*)\s*\}\}/g
		} );

		if ( options.basePath.substr( -1 , 1 ) !== "/" && options.basePath.length > 0 ) {
			options.basePath = options.basePath + "/";
		}


		// =======================
		// -- DEFAULT PROCESSOR --
		// =======================

		// This process method is used when no process function is supplied.

		function defaultProcess( template, content, suffix ) {
			return template.replace( options.parsePattern, function( match, key ) {
				return resolveName( key, content, suffix );
			} );
		}

		if ( ! options.hasOwnProperty( "process" ) ) {
			options.process = defaultProcess;
		}

		// ===========
		// -- UTILS --
		// ===========

		// Regex to parse bake tags. The regex returns file path as match.

		var regex = /([ |\t]*)<!--\(\s?bake\s+([\w\/.\-]+)\s?([^>]*)\)-->/g;
		var regexInline = /(?:[ |\t]*<!--\(\s?bake-start\s+([^>]*)\)-->)\n?([\s\S]+?)(?:[ |\t]*<!--\(\s?bake-end\s?\)-->)/g;

		// Regex to parse attributes.

		var attributesRegex = /([\S_]+)="([^"]+)"/g;


		// Regex to detect array syntax.

		var arrayRegex = /\[([\w\.\,\-]*)\]/;
		
		
		// Regex to parse suffixes.

		var suffixRegex = /suffix\{"([^"]+)"\}/;


		// Method to check wether file exists and warn if not.

		function checkFile( src ) {
			if ( ! grunt.file.exists( src ) ) {
				grunt.log.error( "Source file \"" + src + "\" not fount." );
				return false;
			}

			return true;
		}


		// Returns the directory path from a file path

		function directory( path ) {
			var segments = path.split( "/" );

			segments.pop();

			return segments.join( "/" );
		}


		// Parses attribute string.

		function parseInlineValues( s ) {
			var match;
			var values = {};

			while( match = attributesRegex.exec( s ) ) {
				values[ match[ 1 ] ] = match[ 2 ];
			}

			return values;
		}
		
		// Parses suffix string.

		function parseSuffix( s ) {
			var match;
			
			match = suffixRegex.exec( s );
			
			if (match) {
				return match[1];
			}
			else {
				return "";
			}
		}


		// Helper method to resolve nested placeholder names like: "home.footer.text"

		function resolveName( name, values, suffix ) {
			
			if ( typeof suffix === "undefined" ) {
				return mout.object.get( values, name ) || "";
			}
			else {
				var t = name.split( "." );
				t[0] = t[0] + suffix;
				
				var value = mout.object.get( values, t.join( "." ) );
				
				if ( typeof value !== "undefined" ) {
					return value;
				}
				else {
					return mout.object.get( values, name ) || "";
				}
			}
		}


		// Helper that simply checks weather a value exists and is not `false`

		function hasValue( name, values ) {
			var current = mout.object.get( values, name );
			return current === false || current === undefined ? false : true;
		}


		// Helper method to apply indent

		function applyIndent( indent, content ) {
			if ( ! indent || indent.length < 1 ) {
				return content;
			}

			var lines = content.split( "\n" );
			var prepedLines = lines.map( function( line ) {
				return indent + line;
			} );

			return prepedLines.join( "\n" );
		}


		// Helper to either find values from JSON or inline values

		function getArrayValues( string, values ) {

			string = string.split( " " ).join( "" );

			if ( arrayRegex.test( string ) )
				return string.match( arrayRegex )[ 1 ].split( "," );

			else {
				var array = resolveName( string, values );
				if ( array === "" ) array = [];

				return array;
			}

		}


		// Handle _if attributes in inline arguments

		function validateIf( inlineValues, values ) {
			if ( "_if" in inlineValues ) {

				var value = inlineValues[ "_if" ];
				delete inlineValues[ "_if" ];

				if ( ! hasValue( value, values ) ) return true;
			}

			return false;
		}


		// Handle _foreach attributes in inline arguments

		function validateForEach( inlineValues, values, array ) {

			if ( "_foreach" in inlineValues ) {

				var pair = inlineValues[ "_foreach" ].split( ":" );
				delete inlineValues[ "_foreach" ];

				getArrayValues( pair[ 1 ], values ).forEach( function( value ) {
					array.push( value );
				} );

				return pair[ 0 ];
			}

			return null;
		}

		function preparePath( includePath, filePath ) {
			if ( includePath[ 0 ] === "/" )
				return options.basePath + includePath.substr( 1 );
			else return directory( filePath ) + "/" + includePath;
		}

		function replace( indent, includePath, attributes, filePath, values ) {
			
			includePath = preparePath( includePath, filePath );

			var inlineValues = parseInlineValues( attributes );
			var suffix = parseSuffix(attributes);

			if ( validateIf( inlineValues, values ) ) return "";

			var forEachValues = [];
			var forEachName = validateForEach( inlineValues, values, forEachValues );
			var includeContent = grunt.file.read( includePath );

			values = mout.object.merge( values, inlineValues );

			includeContent = applyIndent( indent, includeContent );

			if ( forEachValues.length > 0 ) {

				var fragment = "";
				var newline = "";
				var oldValue = values[ forEachName ];

				forEachValues.forEach( function( value, index ) {
					values[ forEachName ] = value;
					newline = index > 0 ? "\n" : "";

					fragment += newline + parse( includeContent, includePath, values );
				} );

				if ( oldValue === undefined ) values[ forEachName ] = oldValue;
				else delete values[ forEachName ];

				return fragment;

			} else {
			
				return parse( includeContent, includePath, values, suffix);

			}

		}

		function inlineReplace( attributes, content, filePath, values ) {

			var inlineValues = parseInlineValues( attributes );
			var suffix = parseSuffix(attributes);
			
			if ( validateIf( inlineValues, values ) ) return "";

			var forEachValues = [];
			var forEachName = validateForEach( inlineValues, values, forEachValues );
			var includeContent = content.trimRight();

			values = mout.object.merge( values, inlineValues );

			if ( forEachValues.length > 0 ) {

				var fragment = "";
				var newline = "";
				var oldValue = values[ forEachName ];

				forEachValues.forEach( function( value, index ) {
					values[ forEachName ] = value;

					newline = typeof options.process === "function" ? options.process( includeContent, values ) : includeContent;

					fragment += ( index > 0 ? "\n" : "" ) + newline;
				} );

				if ( oldValue === undefined ) values[ forEachName ] = oldValue;
				else delete values[ forEachName ];

				return fragment;

			} else {

				return parse( includeContent, filePath, values, suffix );

			}
		}


		// =====================
		// -- RECURSIVE PARSE --
		// =====================

		// Recursivly search for includes and create one file.

		function parse( fileContent, filePath, values, suffix ) {

			fileContent = fileContent.replace( regexInline, function( match, attributes, content ) {
				return inlineReplace( attributes, content, filePath, values );
			} );

			if ( typeof options.process === "function" ) {
				fileContent = options.process( fileContent, values, suffix );
			}

			fileContent = fileContent.replace( regex, function( match, indent, includePath, attributes ) {
				return replace( indent, includePath, attributes, filePath, values );
			} );


			return fileContent;
		}


		// ==========
		// -- BAKE --
		// ==========


		// Loop over files and create baked files.

		this.files.forEach( function( file ) {

			var src = file.src[ 0 ];
			var dest = file.dest;

			checkFile( src );

			var values = options.content ? grunt.file.readJSON( options.content ) : {};

			if ( options.section ) {

				if ( ! values[ options.section ] ) {
					grunt.log.error( "content doesn't have section " + options.section );
				}

				values = values[ options.section ];
			}

			var srcContent = grunt.file.read( src );
			var destContent = parse( srcContent, src, values );

			grunt.file.write( dest, destContent );
			grunt.log.ok( "File \"" + dest + "\" created." );

		} );
	} );
};
