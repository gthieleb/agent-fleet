{{/*
Expand the name of the chart.
*/}}
{{- define "agent-fleet-worker.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name.
*/}}
{{- define "agent-fleet-worker.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "agent-fleet-worker.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "agent-fleet-worker.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "agent-fleet-worker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agent-fleet-worker.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Resolve the secret name that holds the OpenCode password. Fails when neither
an existing secret nor an inline password is configured.
*/}}
{{- define "agent-fleet-worker.passwordSecretName" -}}
{{- if .Values.opencodePassword.secretKeyRef.name }}
{{- .Values.opencodePassword.secretKeyRef.name }}
{{- else if .Values.opencodePassword.inline }}
{{- include "agent-fleet-worker.fullname" . }}
{{- else }}
{{- fail "opencodePassword: set either opencodePassword.secretKeyRef.name (existing secret) or opencodePassword.inline (dev/E2E only)" }}
{{- end }}
{{- end }}
