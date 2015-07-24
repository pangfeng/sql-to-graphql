'use strict';

var capitalize = require('lodash/string/capitalize');
var snakeCase = require('lodash/string/snakeCase');
var b = require('ast-types').builders;

var typeMap = {
    'string': 'GraphQLString',
    'integer': 'GraphQLInt',
    'float': 'GraphQLFloat'
};

function generateTypes(data, opts) {
    var types = {}, typesUsed;
    for (var typeName in data.models) {
        typesUsed = [];
        types[typeName] = generateType(typeName, data.models[typeName]);
        types[typeName].imports = typesUsed;
    }

    return types;

    function addUsedType(type) {
        if (typesUsed.indexOf(type) === -1) {
            typesUsed.push(type);
        }
    }

    function generateType(name, model) {
        var fields = [], fieldNames = Object.keys(model.fields);
        for (var fieldName in model.fields) {
            fields.push(generateField(model.fields[fieldName]));

            if (model.references[fieldName]) {
                fields.push(generateReferenceField(
                    fieldName,
                    model.references[fieldName],
                    fieldNames
                ));
            }
        }

        var typeDeclaration = b.objectExpression([
            b.property('init', b.identifier('name'), b.literal(name)),
            generateDescription(model.description),
            b.property('init', b.identifier('fields'), b.objectExpression(fields))
        ]);

        return {
            ast: buildVar(
                name + 'Type',
                b.newExpression(
                    b.identifier('GraphQLObjectType'),
                    [typeDeclaration]
                ),
                opts
            )
        };
    }

    function generateDescription(description) {
        return b.property(
            'init',
            b.identifier('description'),
            b.literal(description || opts.defaultDescription)
        );
    }

    function generateField(field, type) {
        return b.property(
            'init',
            b.identifier(field.name),
            b.objectExpression([
                b.property('init', b.identifier('type'), type || getType(field)),
                generateDescription(field.description)
            ])
        );
    }

    function generateReferenceField(refName, refersTo, otherFields) {
        var fieldName = refName.replace(/Id$/, '');

        // If we collide with a different field name, add a "Ref"-suffix
        if (otherFields.indexOf(fieldName) !== -1) {
            fieldName += 'Ref';
        }

        var description = opts.defaultDescription;
        if (fieldName.indexOf('parent') === 0) {
            description += ' (parent ' + refersTo.name + ')';
        } else {
            description += ' (reference)';
        }

        var refTypeName = refersTo.name + 'Type';
        addUsedType(refTypeName);

        return generateField({
            name: fieldName,
            description: description
        }, b.identifier(refTypeName));
    }

    function getType(field) {
        if (field.type === 'enum') {
            addUsedType('GraphQLEnumType');
            return getEnum(field);
        }

        var type = typeMap[field.type];
        var identifier = b.identifier(type);

        addUsedType(type);

        if (!field.isNullable) {
            addUsedType('GraphQLNonNull');
            return b.newExpression(b.identifier('GraphQLNonNull'), [identifier]);
        }

        return identifier;
    }

    function getEnum(field) {
        var values = [], enumValue;
        for (var name in field.values) {
            enumValue = field.values[name];
            values.push(b.property(
                'init',
                b.identifier(snakeCase(name).toUpperCase()),
                b.objectExpression([
                    b.property('init', b.identifier('value'), b.literal(enumValue.value)),
                    generateDescription(enumValue.description)
                ])
            ));
        }

        var typeDeclaration = b.objectExpression([
            b.property('init', b.identifier('name'), b.literal(capitalize(field.name))),
            generateDescription(field.description),
            b.property('init', b.identifier('values'), b.objectExpression(values))
        ]);

        return b.newExpression(
            b.identifier('GraphQLEnumType'),
            [typeDeclaration]
        );
    }

    function buildVar(name, val) {
        var varStyle = opts.es6 ? 'const' : 'var';
        return b.variableDeclaration(varStyle, [
            b.variableDeclarator(
                b.identifier(name),
                val
            )
        ]);
    }
}

module.exports = generateTypes;