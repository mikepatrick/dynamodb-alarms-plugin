Create Cloudwatch alarms for all DynamoDB tables' read and write capacity.

Usage
===

In Serverless template:

```
plugins:
  - dynamodb-alarms-plugin

custom:
  dynamo-alarms:
    ReadCapacityPercent: 80
    WriteCapacityPercent: 80
    Period: 60
    EvaluationPeriods: 1
    TopicName: snsNotificationTopic
```


