'use strict';

const _ = require('lodash');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.addAlarms.bind(this),
    };
  }

  findDynamoTables(resources) {
    return _.values(resources)
      .filter(item => {
        return item.Type === 'AWS::DynamoDB::Table';
      })
      .map(table => {
        return {
          tableName: table.Properties.TableName,
          readCapacity: table.Properties.ProvisionedThroughput.ReadCapacityUnits,
          writeCapacity: table.Properties.ProvisionedThroughput.WriteCapacityUnits,
        };
      });
  }

  addAlarms() {
    if (!this.serverless.service.custom || !this.serverless.service.custom['dynamo-alarms']) {
      return;
    }

    const myResources = this.serverless.service.resources.Resources;
    const alarmConfig = this.serverless.service.custom['dynamo-alarms'];
    const { ReadCapacityPercent, WriteCapacityPercent, Period, EvaluationPeriods, TopicName } = alarmConfig;
    const region = this.serverless.getProvider('aws').getRegion();

    const alarms = this.findDynamoTables(myResources).map(item => {
      const adjustedReadCapacity = Math.floor((item.readCapacity * ReadCapacityPercent) / 100);
      const adjustedWriteCapacity = Math.floor((item.writeCapacity * WriteCapacityPercent) / 100);

      let alphaNumTableName = item.tableName.replace(/[^0-9a-z]/gi, '');

      const capacityAlarmSnippet = {
        [alphaNumTableName + 'ReadAlarm']: {
          Type: 'AWS::CloudWatch::Alarm',
          Properties: {
            AlarmDescription: `DynamoDB read capacity alarm for ${item.tableName}.`,
            Namespace: 'AWS/DynamoDB',
            MetricName: 'ConsumedReadCapacityUnits',
            Dimensions: [
              {
                Name: 'TableName',
                Value: item.tableName,
              },
            ],
            Statistic: 'Maximum',
            Period: Period,
            EvaluationPeriods: EvaluationPeriods,
            Threshold: adjustedReadCapacity,
            ComparisonOperator: 'GreaterThanOrEqualToThreshold',
            TreatMissingData: 'notBreaching',
            AlarmActions: [
              { 'Fn::Join': ['', ['arn:aws:sns:' + region + ':', { Ref: 'AWS::AccountId' }, ':' + TopicName]] },
            ],
            OKActions: [
              { 'Fn::Join': ['', ['arn:aws:sns:' + region + ':', { Ref: 'AWS::AccountId' }, ':' + TopicName]] },
            ],
          },
        },
        [alphaNumTableName + 'WriteAlarm']: {
          Type: 'AWS::CloudWatch::Alarm',
          Properties: {
            AlarmDescription: `DynamoDB write capacity alarm for ${item.tableName}`,
            Namespace: 'AWS/DynamoDB',
            MetricName: 'ConsumedWriteCapacityUnits',
            Dimensions: [
              {
                Name: 'TableName',
                Value: item.tableName,
              },
            ],
            Statistic: 'Maximum',
            Period: 60,
            EvaluationPeriods: 1,
            Threshold: adjustedWriteCapacity,
            ComparisonOperator: 'GreaterThanOrEqualToThreshold',
            TreatMissingData: 'notBreaching',
            AlarmActions: [
              { 'Fn::Join': ['', ['arn:aws:sns:' + region + ':', { Ref: 'AWS::AccountId' }, ':' + TopicName]] },
            ],
            OKActions: [
              { 'Fn::Join': ['', ['arn:aws:sns:' + region + ':', { Ref: 'AWS::AccountId' }, ':' + TopicName]] },
            ],
          },
        },
      };
      this.serverless.cli.log(`Creating Cloudwatch alarms for DynamoDB table ${item.tableName}`);
      return capacityAlarmSnippet;
    });

    alarms.forEach(alarm => {
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, alarm);
    });
  }
}

module.exports = ServerlessPlugin;
