{# Use the custom schema name verbatim (staging/silver/gold) rather than
   dbt's default target_customschema concatenation, so physical schema
   names match the migration script and the source definitions exactly. #}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
